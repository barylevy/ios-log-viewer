#!/usr/bin/perl
#
# Cato live-logs server for macOS — uses only the Perl that ships with macOS
# (core modules only, nothing to install).
#
# Runs as a root LaunchDaemon (see cato-live-logs-mac-install.sh) so it can read
# the root-owned Cato logs in place, and streams them to the viewer over a
# WebSocket on 127.0.0.1:4000. It speaks the same protocol as the Windows
# live-logs-server.js, so the viewer uses the same client (useLiveLogs):
#   { type: 'initial' | 'append' | 'reset', sourceKey, label, content }
#
# Access control:
#   - listens on the loopback interface only, and checks the Host header
#   - accepts only the viewer origin(s) written to the config by the installer
#   - requires a pairing token (WebSocket subprotocol / X-Viewer-Token header)
#   - log locations are fixed here; nothing the client sends is used as a path
#     or a command. Logs under the user's home are read with the user's own
#     identity, so links planted there can't expose root-only files.
#
# Mirrored to client/public/ by scripts/sync-public.js — edit only this copy.

use strict;
use warnings;
use IO::Socket::INET;
use IO::Select;
use Digest::SHA qw(sha1_base64);
use Encode ();
use Errno qw(EAGAIN EWOULDBLOCK EINTR);
use Fcntl qw(O_RDONLY O_NOFOLLOW S_ISREG);
use JSON::PP ();
use Time::HiRes qw(time);

$SIG{PIPE} = 'IGNORE';
$SIG{TERM} = $SIG{INT} = sub { exit 0 };
$| = 1;

my $POLL_SECONDS       = 1;
my $MAX_READ_BYTES     = 8 * 1024 * 1024;  # per source, per read
my $MAX_TEXT_CHARS     = 4 * 1024 * 1024;  # retained per source
my $MAX_PENDING_BYTES  = 1024 * 1024;      # an unterminated line is flushed past this
my $INITIAL_TAIL_LINES = 5000;
my $MAX_CLIENTS        = 8;
my $MAX_HEADER_BYTES   = 8192;
my $MAX_FRAME_BYTES    = 64 * 1024;
my $MAX_OUT_BYTES      = 32 * 1024 * 1024;  # a client this far behind is dropped
my $HANDSHAKE_SECONDS  = 10;
my $WS_GUID            = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

# ─── Configuration ────────────────────────────────────────────────────────────

my $config_path = '/Library/Application Support/CatoLogViewerLiveLogs/config';
for (my $i = 0; $i < @ARGV; $i++) {
  $config_path = $ARGV[++$i] if $ARGV[$i] eq '--config' && defined $ARGV[$i + 1];
}
my %cfg = read_config($config_path);

my %allowed_origin = map { $_ => 1 } @{ $cfg{origin} };
my @tokens = @{ $cfg{token} };
my $port = $cfg{port} // 4000;
my ($run_uid, $run_gid, $home);
{
  my @pw = getpwnam($cfg{user}) or die "Unknown user '$cfg{user}'\n";
  ($run_uid, $run_gid, $home) = @pw[2, 3, 7];
  $home = $cfg{home} if defined $cfg{home};
}

sub read_config {
  my ($path) = @_;
  open(my $fh, '<', $path) or die "Cannot read config $path: $!\n";
  my %c = (origin => [], token => []);
  while (my $line = <$fh>) {
    chomp $line;
    next if $line eq '' || $line =~ /^#/;
    my ($k, $v) = $line =~ /^([a-z]+)=(.*)$/ or die "Bad config line\n";
    if ($k eq 'origin') {
      $v =~ m{^https?://[A-Za-z0-9.-]+(?::[0-9]{1,5})?$} or die "Bad origin in config\n";
      push @{ $c{origin} }, $v;
    } elsif ($k eq 'token') {
      $v =~ /^[A-Za-z0-9-]{16,128}$/ or die "Bad token in config\n";
      push @{ $c{token} }, $v;
    } elsif ($k eq 'user') {
      $v =~ /^[A-Za-z0-9._-]+$/ or die "Bad user in config\n";
      $c{user} = $v;
    } elsif ($k eq 'home') {
      $v =~ m{^/[^[:cntrl:]]+$} or die "Bad home in config\n";
      $c{home} = $v;
    } elsif ($k eq 'port') {
      $v =~ /^[0-9]{4,5}$/ && $v >= 1024 && $v <= 65535 or die "Bad port in config\n";
      $c{port} = $v;
    } else {
      die "Unknown config key '$k'\n";
    }
  }
  die "Config needs origin, token and user\n"
    unless @{ $c{origin} } && @{ $c{token} } && defined $c{user};
  return %c;
}

sub logmsg { print STDERR scalar(localtime), " [live-logs] @_\n" }

# ─── Sources ──────────────────────────────────────────────────────────────────
# The Cato client log locations; keys match the viewer's live tabs. Each source
# tails the most recently modified matching file across its directories.
# `as_user` directories are read with the user's identity (see with_identity).

my $GROUP   = 'CKGSB8CH43.group';
my $ROOT_GC = "/private/var/root/Library/Group Containers/$GROUP";
my $USER_GC = "$home/Library/Group Containers/$GROUP";
my $LOG_RE  = qr/\.(?:log|txt)$/i;
my $AT_RE   = qr/^AntiTamperLogs/;

my @SOURCES = (
  { key => 'app', label => 'AppLogs', match => $LOG_RE, exclude => $AT_RE,
    dirs => [ [ "$USER_GC/AppLogs", 1 ] ] },
  { key => 'ext', label => 'Extension', match => $LOG_RE,
    dirs => [ [ "$ROOT_GC/AppExtensionLogs", 0 ] ] },
  { key => 'dns', label => 'DNSRelay', match => $LOG_RE,
    dirs => [ [ "$ROOT_GC/DNSExtensionLogs", 0 ] ] },
  { key => 'antitamper', label => 'AntiTamper', match => $AT_RE,
    dirs => [ [ "$ROOT_GC/AppLogs", 0 ], [ "$ROOT_GC/AntiTamperLogs", 0 ], [ "$USER_GC/AppLogs", 1 ] ] },
  { key => 'agent', label => 'UserAgent', match => $LOG_RE,
    dirs => [ [ "$home/Library/Logs/CatoNetworksUserAgent", 1 ] ] },
  { key => 'daemon', label => 'Daemon', match => $LOG_RE,
    dirs => [ [ '/private/var/root/Library/Logs/com.catonetworks.mac.CatoClient.helper', 0 ] ] },
  # /var/tmp is world-writable: only a root-owned, single-link regular file counts.
  { key => 'install', label => 'Install', file => '/var/tmp/catoinstallext.txt' },
);

my %state;  # key => { file => {dev, ino}, offset, pending, text }

# Run $code with the user's effective uid/gid when running as root.
# Returns undef (without running $code) if the switch fails.
sub with_identity {
  my ($as_user, $code) = @_;
  return $code->() unless $as_user && $> == 0;
  local $) = "$run_gid $run_gid";
  local $> = $run_uid;
  return undef unless $> == $run_uid;
  return $code->();
}

# The newest matching regular file (never a symlink) for a source.
sub newest_file {
  my ($src) = @_;
  if ($src->{file}) {
    my @st = lstat $src->{file} or return undef;
    return undef unless S_ISREG($st[2]) && $st[4] == 0 && $st[3] == 1;
    return { path => $src->{file}, as_user => 0, dev => $st[0], ino => $st[1],
             size => $st[7], mtime => $st[9], root_only => 1 };
  }
  my $best;
  for my $d (@{ $src->{dirs} }) {
    my ($dir, $as_user) = @$d;
    with_identity($as_user, sub {
      opendir(my $dh, $dir) or return;
      for my $name (readdir $dh) {
        next if $name =~ /^\./ || $name !~ $src->{match};
        next if $src->{exclude} && $name =~ $src->{exclude};
        my @st = lstat "$dir/$name" or next;
        next unless S_ISREG($st[2]);
        my $f = { path => "$dir/$name", as_user => $as_user, dev => $st[0], ino => $st[1],
                  size => $st[7], mtime => $st[9] };
        $best = $f if !$best || $f->{mtime} > $best->{mtime}
          || ($f->{mtime} == $best->{mtime} && $f->{path} gt $best->{path});
      }
      closedir $dh;
    });
  }
  return $best;
}

# Read `$len` bytes at `$offset`, verifying the opened file is the one listed.
sub read_range {
  my ($f, $offset, $len) = @_;
  return with_identity($f->{as_user}, sub {
    sysopen(my $fh, $f->{path}, O_RDONLY | O_NOFOLLOW) or return undef;
    my @st = stat $fh;
    return undef unless @st && S_ISREG($st[2]) && $st[0] == $f->{dev} && $st[1] == $f->{ino};
    return undef if $f->{root_only} && ($st[4] != 0 || $st[3] != 1);
    sysseek($fh, $offset, 0) or return undef;
    my $buf = '';
    while (length($buf) < $len) {
      my $n = sysread($fh, $buf, $len - length($buf), length($buf));
      return undef unless defined $n;
      last if $n == 0;
    }
    close $fh;
    return $buf;
  });
}

# Complete lines from pending + new bytes, decoded; keeps the partial last line.
sub take_lines {
  my ($st, $bytes) = @_;
  my $all = $st->{pending} . $bytes;
  my $cut = rindex($all, "\n");
  if ($cut < 0) {
    if (length($all) <= $MAX_PENDING_BYTES) { $st->{pending} = $all; return '' }
    $st->{pending} = '';
    return Encode::decode('UTF-8', $all);
  }
  $st->{pending} = substr($all, $cut + 1);
  return Encode::decode('UTF-8', substr($all, 0, $cut + 1));
}

sub drop_first_line {
  my ($bytes) = @_;
  my $i = index($bytes, "\n");
  return $i < 0 ? '' : substr($bytes, $i + 1);
}

sub bound_text {
  my ($st) = @_;
  return if length($st->{text}) <= $MAX_TEXT_CHARS;
  my $tail = substr($st->{text}, -int($MAX_TEXT_CHARS / 2));
  my $i = index($tail, "\n");
  $st->{text} = $i < 0 ? $tail : substr($tail, $i + 1);
}

sub tail_lines {
  my ($text, $n) = @_;
  my $idx = length $text;
  for (1 .. $n) {
    return $text if $idx == 0;
    my $prev = rindex($text, "\n", $idx - 1);
    return $text if $prev < 0;
    $idx = $prev;
  }
  return substr($text, $idx + 1);
}

# Bring one source up to date. Returns (type, content) to broadcast, or ().
sub poll_source {
  my ($src) = @_;
  my $st = $state{ $src->{key} } //= { offset => 0, pending => '', text => '' };
  my $f = newest_file($src);

  if (!$f) {
    return () unless $st->{file};
    %$st = (offset => 0, pending => '', text => '');
    return ('reset', '');
  }

  my $same = $st->{file} && $st->{file}{dev} == $f->{dev} && $st->{file}{ino} == $f->{ino};
  return () if $same && $f->{size} == $st->{offset};

  if ($same && $f->{size} > $st->{offset}) {
    my $start = $st->{offset};
    my $skipped = $f->{size} - $start > $MAX_READ_BYTES;
    $start = $f->{size} - $MAX_READ_BYTES if $skipped;
    my $bytes = read_range($f, $start, $f->{size} - $start);
    return () unless defined $bytes;
    $st->{offset} = $start + length $bytes;
    if ($skipped) {
      $st->{pending} = '';
      $st->{text} = take_lines($st, drop_first_line($bytes));
      bound_text($st);
      return ('reset', tail_lines($st->{text}, $INITIAL_TAIL_LINES));
    }
    my $text = take_lines($st, $bytes);
    return () if $text eq '';
    $st->{text} .= $text;
    bound_text($st);
    return ('append', $text);
  }

  # A different file, or the same one truncated: start over from its tail.
  my $start = $f->{size} > $MAX_READ_BYTES ? $f->{size} - $MAX_READ_BYTES : 0;
  my $bytes = read_range($f, $start, $f->{size} - $start);
  return () unless defined $bytes;
  %$st = (file => { dev => $f->{dev}, ino => $f->{ino} }, offset => $start + length($bytes),
          pending => '', text => '');
  $bytes = drop_first_line($bytes) if $start > 0;  # starts mid-line
  $st->{text} = take_lines($st, $bytes);
  bound_text($st);
  return ('reset', tail_lines($st->{text}, $INITIAL_TAIL_LINES));
}

# ─── WebSocket / HTTP ─────────────────────────────────────────────────────────

my $json = JSON::PP->new->utf8->canonical;
my %clients;  # fileno => { sock, in, out, ws, close_after, since }
my $readers;  # IO::Select of the listener and client sockets

sub token_ok {
  my ($given) = @_;
  return 0 unless defined $given;
  my $ok = 0;
  for my $t (@tokens) {
    next unless length($given) == length($t);
    my $diff = 0;
    $diff |= ord(substr($given, $_, 1)) ^ ord(substr($t, $_, 1)) for 0 .. length($t) - 1;
    $ok = 1 if $diff == 0;
  }
  return $ok;
}

sub host_ok {
  my ($host) = @_;
  return defined $host && ($host eq "localhost:$port" || $host eq "127.0.0.1:$port");
}

sub ws_frame {
  my ($op, $data) = @_;
  my $len = length $data;
  my $head = chr(0x80 | $op);
  if    ($len < 126)   { $head .= chr($len) }
  elsif ($len < 65536) { $head .= chr(126) . pack('n', $len) }
  else                 { $head .= chr(127) . pack('Q>', $len) }
  return $head . $data;
}

sub queue {
  my ($c, $data) = @_;
  $c->{out} .= $data;
  if (length($c->{out}) > $MAX_OUT_BYTES) { drop($c, 'too slow'); return }
  flush($c);
}

sub flush {
  my ($c) = @_;
  while (length $c->{out}) {
    my $n = syswrite($c->{sock}, $c->{out}, 256 * 1024);
    if (!defined $n) {
      return if $! == EAGAIN || $! == EWOULDBLOCK || $! == EINTR;
      return drop($c);
    }
    substr($c->{out}, 0, $n) = '';
  }
  drop($c) if $c->{close_after};
}

sub drop {
  my ($c, $why) = @_;
  my $fd = $c->{fd};
  return unless $clients{$fd};
  delete $clients{$fd};
  $readers->remove($c->{sock});  # before close: IO::Select keys on the fileno
  close $c->{sock};
  if ($c->{ws}) {
    logmsg('Client disconnected' . ($why ? " ($why)" : ''));
    reset_state() unless grep { $_->{ws} } values %clients;
  }
}

sub reset_state { %state = () }

sub send_json {
  my ($c, $msg) = @_;
  queue($c, ws_frame(1, $json->encode($msg)));
}

sub http_reply {
  my ($c, $status, $body, $extra) = @_;
  $body //= '';
  my $head = "HTTP/1.1 $status\r\nContent-Type: text/plain\r\nContent-Length: " . length($body)
    . "\r\nCache-Control: no-store\r\nConnection: close\r\n" . ($extra // '') . "\r\n";
  $c->{close_after} = 1;
  queue($c, $head . $body);
}

sub cors_headers {
  my ($h) = @_;
  my $origin = $h->{origin};
  return '' unless defined $origin && $allowed_origin{$origin};
  my $out = "Access-Control-Allow-Origin: $origin\r\nVary: Origin\r\n"
    . "Access-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: X-Viewer-Token\r\n";
  $out .= "Access-Control-Allow-Private-Network: true\r\n"
    if ($h->{'access-control-request-private-network'} // '') eq 'true';
  return $out;
}

sub handle_http {
  my ($c, $head) = @_;
  my @lines = split /\r\n/, $head;
  my ($method, $target) = (shift(@lines) // '') =~ m{^([A-Z]+) (\S+) HTTP/1\.[01]$}
    or return http_reply($c, '400 Bad Request');
  my %h;
  for (@lines) {
    my ($k, $v) = /^([A-Za-z0-9-]+):[ \t]*(.*?)[ \t]*$/ or return http_reply($c, '400 Bad Request');
    $k = lc $k;
    return http_reply($c, '400 Bad Request') if exists $h{$k};  # no duplicate headers
    $h{$k} = $v;
  }
  return http_reply($c, '403 Forbidden', 'Invalid host.') unless host_ok($h{host});
  my $origin = $h{origin};
  return http_reply($c, '403 Forbidden', 'Viewer origin is not allowed.')
    if defined $origin && !$allowed_origin{$origin};
  (my $path = $target) =~ s/\?.*//;

  if ($method eq 'OPTIONS') {
    return http_reply($c, '204 No Content', '', cors_headers(\%h));
  }
  return http_reply($c, '405 Method Not Allowed') unless $method eq 'GET';

  if (($h{upgrade} // '') =~ /^websocket$/i) {
    return http_reply($c, '403 Forbidden') unless defined $origin && $path eq '/';
    my @protocols = split /\s*,\s*/, ($h{'sec-websocket-protocol'} // '');
    my $key = $h{'sec-websocket-key'} // '';
    return http_reply($c, '400 Bad Request')
      unless ($h{'sec-websocket-version'} // '') eq '13' && $key =~ m{^[A-Za-z0-9+/]{22}==$};
    return http_reply($c, '401 Unauthorized')
      unless @protocols == 2 && $protocols[0] eq 'cato-logs' && token_ok($protocols[1]);
    if ((grep { $_->{ws} } values %clients) >= $MAX_CLIENTS) {
      return http_reply($c, '503 Service Unavailable');
    }
    my $accept = sha1_base64($key . $WS_GUID) . '=';
    $c->{ws} = 1;
    queue($c, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
      . "Sec-WebSocket-Accept: $accept\r\nSec-WebSocket-Protocol: cato-logs\r\n\r\n");
    return unless $clients{ $c->{fd} };
    logmsg('Client connected');
    poll_all($c);  # catch up existing clients, then give this one the current tail
    for my $src (@SOURCES) {
      my $st = $state{ $src->{key} };
      next unless $st && $st->{file};
      send_json($c, { type => 'initial', sourceKey => $src->{key}, label => $src->{label},
                      content => tail_lines($st->{text}, $INITIAL_TAIL_LINES) });
      return unless $clients{ $c->{fd} };
    }
    return;
  }

  if ($path eq '/health') {
    return http_reply($c, '401 Unauthorized', 'Pair this viewer by running the install command again.',
      cors_headers(\%h)) unless token_ok($h{'x-viewer-token'});
    return http_reply($c, '200 OK', 'ok', cors_headers(\%h));
  }
  return http_reply($c, '404 Not Found');
}

sub handle_frames {
  my ($c) = @_;
  while (length($c->{in}) >= 2) {
    my ($b1, $b2) = unpack('CC', $c->{in});
    my $op = $b1 & 0x0f;
    return drop($c, 'unmasked frame') unless $b2 & 0x80;
    my $len = $b2 & 0x7f;
    my $off = 2;
    if ($len == 126) {
      return if length($c->{in}) < 4;
      $len = unpack('n', substr($c->{in}, 2, 2));
      $off = 4;
    } elsif ($len == 127) {
      return drop($c, 'frame too large');
    }
    return drop($c, 'frame too large') if $len > $MAX_FRAME_BYTES;
    return if length($c->{in}) < $off + 4 + $len;
    my $mask = substr($c->{in}, $off, 4);
    my $payload = substr($c->{in}, $off + 4, $len);
    substr($c->{in}, 0, $off + 4 + $len) = '';
    $payload ^= substr($mask x (int($len / 4) + 1), 0, $len) if $len;
    if ($op == 0x8) {
      $c->{close_after} = 1;
      return queue($c, ws_frame(0x8, ''));
    }
    if ($op == 0x9) {
      queue($c, ws_frame(0xA, substr($payload, 0, 125)));
      return unless $clients{ $c->{fd} };
    }
    # Text/binary/pong frames carry nothing the server acts on.
  }
}

sub handle_read {
  my ($c) = @_;
  my $n = sysread($c->{sock}, my $buf, 65536);
  if (!defined $n) {
    return if $! == EAGAIN || $! == EWOULDBLOCK || $! == EINTR;
    return drop($c);
  }
  return drop($c) if $n == 0;
  return if $c->{close_after};
  $c->{in} .= $buf;

  if ($c->{ws}) {
    return drop($c, 'input overflow') if length($c->{in}) > $MAX_FRAME_BYTES + 16;
    return handle_frames($c);
  }
  my $end = index($c->{in}, "\r\n\r\n");
  if ($end < 0) {
    return http_reply($c, '431 Request Header Fields Too Large') if length($c->{in}) > $MAX_HEADER_BYTES;
    return;
  }
  return http_reply($c, '431 Request Header Fields Too Large') if $end > $MAX_HEADER_BYTES;
  my $head = substr($c->{in}, 0, $end);
  $c->{in} = substr($c->{in}, $end + 4);
  handle_http($c, $head);
}

# Poll every source and broadcast changes to connected clients (except $skip).
sub poll_all {
  my ($skip) = @_;
  my @targets = grep { $_->{ws} && (!$skip || $_ != $skip) } values %clients;
  for my $src (@SOURCES) {
    my ($type, $content) = eval { poll_source($src) };
    if ($@) { logmsg("Unable to read $src->{key}"); next }
    next unless defined $type;
    my $frame = ws_frame(1, $json->encode(
      { type => $type, sourceKey => $src->{key}, label => $src->{label}, content => $content }));
    for my $c (@targets) { queue($c, $frame) if $clients{ $c->{fd} } }
  }
}

# ─── Main loop ────────────────────────────────────────────────────────────────

my $listener = IO::Socket::INET->new(
  LocalAddr => '127.0.0.1', LocalPort => $port, Proto => 'tcp',
  Listen => 16, ReuseAddr => 1, Blocking => 0,
) or die "Cannot listen on 127.0.0.1:$port: $!\n";
logmsg("Listening on 127.0.0.1:$port");

$readers = IO::Select->new($listener);
my $next_poll = time + $POLL_SECONDS;

while (1) {
  my $writers = IO::Select->new(map { $_->{sock} } grep { length $_->{out} } values %clients);
  my $wait = $next_poll - time;
  $wait = 0 if $wait < 0;
  my ($r, $w) = IO::Select->select($readers, $writers, undef, $wait);

  for my $s (@{ $r || [] }) {
    if ($s == $listener) {
      while (my $sock = $listener->accept) {
        if (keys(%clients) >= $MAX_CLIENTS * 2) { close $sock; next }
        $sock->blocking(0);
        my $fd = fileno $sock;
        $clients{$fd} = { fd => $fd, sock => $sock, in => '', out => '', since => time };
        $readers->add($sock);
      }
      next;
    }
    my $c = defined fileno($s) ? $clients{ fileno($s) } : undef;
    handle_read($c) if $c && $c->{sock} == $s;
  }
  for my $s (@{ $w || [] }) {
    my $c = defined fileno($s) ? $clients{ fileno($s) } : undef;
    flush($c) if $c && $c->{sock} == $s;
  }

  if (time >= $next_poll) {
    $next_poll = time + $POLL_SECONDS;
    for my $c (values %clients) {
      drop($c, 'handshake timeout') if !$c->{ws} && time - $c->{since} > $HANDSHAKE_SECONDS;
    }
    poll_all() if grep { $_->{ws} } values %clients;
  }
}
