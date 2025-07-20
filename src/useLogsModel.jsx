import { useState, useEffect } from "react";

const parseLogLine = (line) => {
  const regex = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}:\d{3}) \[(.*?)\] \[(\d+)\] \[(\d+)](?: \[(.*?)\])?(?: \[(.*?)\])? (.*?)$/;
  const match = line.match(regex);
  if (!match) return null;
  const [_, date, time, module, pid, tid, tag, location, message] = match;
  const level =
    message.includes("ERROR") ? "error" :
      message.includes("WARN") ? "warn" :
        message.includes("INFO") ? "info" : "default";
  return { date, time, module, pid, tid, tag, location, message, level, raw: line };
};

export function useLogsModel({ setIsLoading, setLoadProgress }) {
  
  const [parsedLogs, setParsedLogs] = useState([]);
  const [currentDate, setCurrentDate] = useState("");

  const [filterText, setFilterText] = useState(localStorage.getItem("log_filterText") || "");
  const [filterTextInput, setFilterTextInput] = useState(filterText);
  const [filterStart, setFilterStart] = useState(localStorage.getItem("log_filterStart") || "");
  const [filterEnd, setFilterEnd] = useState(localStorage.getItem("log_filterEnd") || "");
  const [removeDuplicates, setRemoveDuplicates] = useState(localStorage.getItem("log_removeDuplicates") === "true");

  const [logMetadata, setLogMetadata] = useState({});
  const [renderedCount, setRenderedCount] = useState(0);

  const [contextLines, setContextLines] = useState(
    Number(localStorage.getItem("log_contextLines") || 2)
  );

  const extractTimePart = (datetimeStr) => {
    if (!datetimeStr.includes("T")) return datetimeStr;
    const [, time] = datetimeStr.split("T"); // e.g. "12:30:45.123"

    const [h, m, rest] = time.split(":");
    const [s = "00", ms = "000"] = (rest || "00").split(".");
    const paddedMs = ms.padEnd(3, "0").slice(0, 3);

    return `${h}:${m}:${s}:${paddedMs}`;
  };

  const [visibleLogs, setVisibleLogs] = useState([]);
const loadLogsFromFile = async (file) => {
  if (!file) return;

  setIsLoading(true);
  setLoadProgress(0);

  const text = await file.text();
  const lines = text.split("\n");

  const metadata = {};
  const metadataKeys = ["User:", "Account:", "Client version:", "OS version:"];
  const headerLines = new Set();

  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i];
    for (const key of metadataKeys) {
      if (line.startsWith(key)) {
        metadata[key.replace(":", "").toLowerCase().replace(" ", "")] = line.replace(key, "").trim();
        headerLines.add(i);
      }
    }
  }

  setLogMetadata(metadata);

  const BATCH_SIZE = 1000;
  const BATCH_DELAY = 50;
  let allLogs = [];

  let lastValidDate = "";
  let lastValidTime = "";

    const processBatch = (startIndex) => {
    const endIndex = Math.min(startIndex + BATCH_SIZE, lines.length);
    const batchLogs = [];

    const progress = Math.round((endIndex / lines.length) * 100);
    setLoadProgress(progress);

    for (let i = startIndex; i < endIndex; i++) {
      const line = lines[i];

      if (!line.trim() || headerLines.has(i)) continue;

      try {
        const entry = parseLogLine(line);

        const logItem = {
          ...(entry || {}),
          lineNumber: i + 1,
          raw: line,
        };

        if (entry) {
          lastValidDate = entry.date;
          lastValidTime = entry.time;
        } else {
          logItem.message = line;
          logItem.level = "default";
          logItem.isMalformed = true;
          logItem.date = lastValidDate;
          logItem.time = lastValidTime;
        }

        batchLogs.push(logItem);
      } catch (err) {
        console.error("Failed to parse log line:", line, err);
        batchLogs.push({
          raw: line,
          message: line,
          level: "default",
          isMalformed: true,
          date: lastValidDate,
          time: lastValidTime,
          lineNumber: i + 1,
        });
      }
    }

    // ⬇️ הוספת batch חדש לרשימה הקיימת
    setParsedLogs((prev) => [...prev, ...batchLogs]);

    if (endIndex < lines.length) {
      setTimeout(() => processBatch(endIndex), BATCH_DELAY);
    } else {
    
      // setParsedLogs(allLogs);
      setCurrentDate(allLogs[0]?.date || "");
      setLoadProgress(100);
      setIsLoading(false);
    }
  };

  setParsedLogs([]);
  processBatch(0);
};


  useEffect(() => {
    const handler = setTimeout(() => {
      setFilterText(filterTextInput);
    }, 1000);
    return () => clearTimeout(handler);
  }, [filterTextInput]);

  useEffect(() => {
    localStorage.setItem("log_filterText", filterText);
    localStorage.setItem("log_filterStart", filterStart);
    localStorage.setItem("log_filterEnd", filterEnd);
    localStorage.setItem("log_removeDuplicates", removeDuplicates);
    localStorage.setItem("log_contextLines", contextLines);

  }, [filterText, filterStart, filterEnd, removeDuplicates, contextLines]);

  useEffect(() => {
    const getLogsWithContext = (logs, matchIndices, context) => {
      const flags = new Array(logs.length).fill(null);

      matchIndices.forEach(index => {
        const start = Math.max(0, index - context);
        const end = Math.min(logs.length, index + context + 1);
        for (let i = start; i < end; i++) {
          if (!flags[i]) flags[i] = { context: false, isMatch: false };
          if (i === index) flags[i].isMatch = true;
          else flags[i].context = true;
        }
      });

      return flags
        .map((flag, i) => flag ? { ...logs[i], ...flag } : null)
        .filter(Boolean);
    };

    if (!filterText.trim()) {
      const filtered = parsedLogs.filter(log => {
        if (filterStart && log.time < extractTimePart(filterStart)) return false;
        if (filterEnd && log.time > extractTimePart(filterEnd)) return false;
        return true;
      });

      const deduped = removeDuplicates
        ? Array.from(new Map(filtered.map(item => [item.message + item.time, item])).values())
        : filtered;

      setVisibleLogs(deduped);
      return;
    }

    const matchIndices = parsedLogs
      .map((log, i) => ({ log, i }))
      .filter(({ log }) => {
        if (filterStart && log.time < extractTimePart(filterStart)) return false;
        if (filterEnd && log.time > extractTimePart(filterEnd)) return false;

        const raw = filterText.toLowerCase();
        const isAnd = raw.includes("&&") || (!raw.includes("||") && raw.includes(" "));
        const separators = isAnd ? /[\s]+/ : /\|\|/;
        const words = raw.split(separators).map(w => w.trim()).filter(Boolean);
        const logText = (log.raw || "").toLowerCase();

        const match = isAnd
          ? words.every(word => logText.includes(word))
          : words.some(word => logText.includes(word));
        return match;
      })
      .map(({ i }) => i);

    const filtered = getLogsWithContext(parsedLogs, matchIndices, contextLines);

    const deduped = removeDuplicates
      ? Array.from(new Map(filtered.map(item => [item.message + item.time, item])).values())
      : filtered;

    setVisibleLogs(deduped);
  }, [parsedLogs, filterText, filterStart, filterEnd, removeDuplicates, contextLines]);

  return {
    logs: visibleLogs,
    currentDate,
    filterTextInput, setFilterTextInput,
    filterStart, setFilterStart,
    filterEnd, setFilterEnd,
    removeDuplicates, setRemoveDuplicates,
    contextLines, setContextLines,
    loadLogsFromFile,
    parsedLogs,
    logMetadata
  };
}
