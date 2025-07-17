import React, { useRef, useState, useEffect } from "react";
import { useLogsModel } from "./useLogsModel";
import { FixedSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";


export default function LogViewer() {
  const {
    logs, currentDate,
    filterTextInput, setFilterTextInput,
    filterStart, setFilterStart,
    filterEnd, setFilterEnd,
    removeDuplicates, setRemoveDuplicates,
    contextLines, setContextLines,
    loadLogsFromFile,
    parsedLogs,
    logMetadata
  } = useLogsModel();

  const [aiSummary, setAiSummary] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const scrollRef = useRef(null);
  const [visibleDate, setVisibleDate] = useState(currentDate);
  const [fileName, setFileName] = useState("");
  const [fileHandle, setFileHandle] = useState(null);

  const summarizeWithAI = async () => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer sk-proj-....`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "user",
            content: "Please summarize the following iOS logs:\n\n" +
              parsedLogs.map(log => log.raw).join("\n"),
          },
        ],
        temperature: 0.3,
      }),
    });

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content || "No summary generated.";
    setAiSummary(summary);
  };

  const getColorByLevel = (level) => {
    switch (level) {
      case "error": return "bg-red-100 border-red-300";
      case "warn": return "bg-yellow-100 border-yellow-300";
      case "info": return "bg-blue-100 border-blue-300";
      default: return "bg-white border-gray-200";
    }
  };

  const handleImportLog = async () => {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "Log Files", accept: { "text/plain": [".log", ".txt"] } }],
    });

    const file = await handle.getFile();
    loadLogsFromFile(file);
    setFileName(file.name);
    setFileHandle(handle);
    localStorage.setItem("lastFileName", handle.name);
  };


  const verifyAndLoadFile = async () => {
    if (!fileHandle) return;

    const permission = await fileHandle.queryPermission?.({ mode: "read" })
      || await fileHandle.requestPermission?.({ mode: "read" });

    if (permission === "granted") {
      const file = await fileHandle.getFile();
      loadLogsFromFile(file);
      setFileName(file.name);
    } else {
      alert("No File Permission.");
    }
  };

  const exportVisibleLogs = async () => {
    if (!logs.length) return;

    const headerLines = [];

    if (logMetadata.user) headerLines.push(`User: ${logMetadata.user}`);
    if (logMetadata.account) headerLines.push(`Account: ${logMetadata.account}`);
    if (logMetadata.clientVersion) headerLines.push(`Client version: ${logMetadata.clientVersion}`);
    if (logMetadata.osVersion) headerLines.push(`OS version: ${logMetadata.osVersion}`);

    const logLines = logs.map(log => log.raw);
    const content = [...headerLines, "", ...logLines].join("\n");

    try {
      const options = {
        suggestedName: "filtered-logs.txt",
        types: [
          {
            description: "Text Files",
            accept: { "text/plain": [".txt"] },
          },
        ],
      };

      const handle = await window.showSaveFilePicker(options);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Export failed:", err);
      }
    }
  };



  const formatTimeInput = (value) => {
    const cleaned = value.replace(/[^0-9]/g, "");
    const parts = [
      cleaned.slice(0, 2),
      cleaned.slice(2, 4),
      cleaned.slice(4, 6),
      cleaned.slice(6, 9),
    ];
    return parts.filter(Boolean).join(":");
  };

  useEffect(() => {
    verifyAndLoadFile();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setSelectedLog(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="sticky top-0 bg-white dark:bg-gray-900 z-20 space-y-2 pb-1">
        <div className="flex flex-wrap justify-between items-start gap-2">
          <div className="flex justify-between items-start flex-wrap gap-x-4 gap-y-1">
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 text-gray-800 dark:text-white">
              <span className="text-2xl font-bold whitespace-nowrap">iOS Log Viewer</span>

              {fileName && (
                <span className="text-sm font-normal text-gray-600 dark:text-gray-300 whitespace-nowrap">
                  • <strong>{fileName}</strong>
                  {fileHandle && (
                    <button
                      className="ml-2 text-blue-500 underline text-xs"
                      onClick={verifyAndLoadFile}
                    >
                      🔄
                    </button>
                  )}
                </span>
              )}

              {logMetadata.user && (
                <span className="text-xs font-normal text-gray-500 dark:text-gray-300 break-words">
                  · {logMetadata.user} · {logMetadata.account} · v{logMetadata.clientVersion} · OS {logMetadata.osVersion}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={summarizeWithAI} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white px-4 py-2 rounded text-sm">🧠 Explain Logs</button>
          <button onClick={handleImportLog} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white px-4 py-2 rounded cursor-pointer text-sm">📁 Import Log</button>
          <button onClick={exportVisibleLogs} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white px-4 py-2 rounded text-sm"> 📤 Export Log </button>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1">
            <input
              className="w-full p-2 pr-8 border rounded text-sm"
              placeholder="Filter logs"
              value={filterTextInput}
              onChange={(e) => setFilterTextInput(e.target.value)}
            />
            {filterTextInput && (
              <button
                onClick={() => setFilterTextInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black dark:hover:text-white"
                aria-label="Clear filter"
              >✕
              </button>
            )}
          </div>
          <input
            type="datetime-local"
            step="0.001"
            className="min-w p-2 border rounded text-sm"
            value={filterStart}
            title="Start time"
            placeholder="Start time"
            onChange={e => setFilterStart(e.target.value)}
            onPaste={(e) => {
              const pasted = (e.clipboardData || window.clipboardData).getData('text');
              const match = pasted.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2}):(\d{3})$/);
              if (match) {
                e.preventDefault();
                const [, date, h, m, s, ms] = match;
                const normalized = `${date}T${h}:${m}:${s}.${ms}`;
                setFilterStart(normalized);
              }
            }}
          />
          <input
            type="datetime-local"
            step="0.001"
            className="min-w p-2 border rounded text-sm"
            title="End time"
            placeholder="End time"
            value={filterEnd}
            onChange={e => setFilterEnd(e.target.value)}
            onPaste={(e) => {
              const pasted = (e.clipboardData || window.clipboardData).getData('text');
              const match = pasted.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2}):(\d{3})$/);
              if (match) {
                e.preventDefault();
                const [, date, h, m, s, ms] = match;
                const normalized = `${date}T${h}:${m}:${s}.${ms}`;
                setFilterEnd(normalized);
              }
            }}
          />

          <input
            type="number"
            title="Number of Rows Wrapping"
            min="0"
            className="w-16 p-2 border rounded"
            placeholder="Context"
            value={contextLines}
            onChange={(e) => setContextLines(Number(e.target.value))}
          />
          <label className="flex items-center space-x-1 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={removeDuplicates}
              onChange={(e) => setRemoveDuplicates(e.target.checked)} />
            <span>Remove duplicates</span>
          </label>
          <div className="text-sm text-gray-600 dark:text-gray-300">Showing: <strong>{logs.length}</strong> records</div>
        </div>

        {aiSummary && (
          <div className="bg-yellow-50 border border-yellow-300 p-4 rounded">
            <h2 className="font-semibold mb-1">AI Summary:</h2>
            <pre className="text-sm whitespace-pre-wrap">{aiSummary}</pre>
          </div>
        )}

      </div>

      <div ref={scrollRef} style={{ height: "75vh" }} className="border rounded">
        <div className="text-gray-500 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-700 px-2 py-1 text-sm">Date: {visibleDate}</div>
        <AutoSizer>
          {({ height, width }) => (
            <List
              height={height}
              itemCount={logs.length}
              itemSize={28}
              width={width}
              onItemsRendered={({ visibleStartIndex }) => {
                const log = logs[visibleStartIndex];
                if (log?.date) {
                  setVisibleDate(log.date);
                }
              }}
            >
              {({ index, style }) => {
                const log = logs[index];
                return (
                  <div
                    key={index}

                    onClick={() => setSelectedLog(log)}
                    style={style}
                    className={`
                            border-b px-2 py-0.5 text-xs leading-tight cursor-pointer
                            ${getColorByLevel(log.level)}
                            ${log.isMalformed ? "bg-orange-100 text-red-700 italic" : ""}
                            ${log.isMatch ? "font-semibold bg-white dark:bg-gray-800" : ""}
                            ${log.context && !log.isMatch ? "opacity-60 italic" : ""}                            
                            ${index % 2 === 1 ? "bg-gray-50 dark:bg-gray-800" : ""}
                            hover:bg-gray-100 dark:hover:bg-gray-700 transition
                          `}
                  >
                    <div className="grid grid-cols-5 gap-1 items-start">
                      <div className="text-gray-500">{log.time}</div>
                      <div className="col-span-4 flex justify-between gap-4 text-gray-800 dark:text-gray-200 truncate">
                        <span className="truncate">{log.message}</span>
                        <span className="flex-shrink-0 text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
                          {log.location && (
                            <span className="text-blue-600 dark:text-blue-400 font-medium">{log.location}</span>
                          )}
                          {log.module && (
                            <span className="text-gray-500 dark:text-gray-400">[{log.module}]</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            </List>

          )}
        </AutoSizer>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white p-6 rounded shadow-lg max-w-3xl max-h-[80vh] overflow-auto relative">
            <button
              onClick={() => setSelectedLog(null)}
              className="absolute top-2 right-2 text-gray-500 hover:text-black dark:hover:text-white"
            >
              ✖
            </button>
            <pre className="whitespace-pre-wrap">{selectedLog.raw}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
