import React, { useState, useRef, useEffect } from "react";
import LogViewerHeader from "./LogViewerHeader";
import LogViewerFilters from "./LogViewerFilters";
import LogListView from "./LogListView";
import LogModal from "./LogModal";
import { useLogsModel } from "./useLogsModel";

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
  const [fileName, setFileName] = useState("");
  const [fileHandle, setFileHandle] = useState(null);
  const [visibleDate, setVisibleDate] = useState(currentDate);

  const summarizeWithAI = async () => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer sk-...`, // Put your OpenAI key here
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{
          role: "user",
          content: "Please summarize the following iOS logs:\n\n" + parsedLogs.map(log => log.raw).join("\n"),
        }],
        temperature: 0.3,
      }),
    });
    const data = await res.json();
    setAiSummary(data.choices?.[0]?.message?.content || "No summary generated.");
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
    const permission = await fileHandle.queryPermission?.({ mode: "read" }) ||
      await fileHandle.requestPermission?.({ mode: "read" });
    if (permission === "granted") {
      const file = await fileHandle.getFile();
      loadLogsFromFile(file);
      setFileName(file.name);
    } else {
      alert("No file permission");
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
        types: [{ description: "Text Files", accept: { "text/plain": [".txt"] } }],
      };
      const handle = await window.showSaveFilePicker(options);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (err) {
      if (err.name !== "AbortError") console.error("Export failed:", err);
    }
  };

  useEffect(() => {
    verifyAndLoadFile();
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setSelectedLog(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="sticky top-0 bg-white dark:bg-gray-900 z-20 space-y-2 pb-1">
        <LogViewerHeader
          fileName={fileName}
          fileHandle={fileHandle}
          logMetadata={logMetadata}
          onImport={handleImportLog}
          onExport={exportVisibleLogs}
          onReload={verifyAndLoadFile}
          onSummarize={summarizeWithAI}
        />
        <LogViewerFilters
          filterTextInput={filterTextInput}
          setFilterTextInput={setFilterTextInput}
          filterStart={filterStart}
          setFilterStart={setFilterStart}
          filterEnd={filterEnd}
          setFilterEnd={setFilterEnd}
          contextLines={contextLines}
          setContextLines={setContextLines}
          removeDuplicates={removeDuplicates}
          setRemoveDuplicates={setRemoveDuplicates}
          logCount={logs.length}
        />
        {aiSummary && (
          <div className="bg-yellow-50 border border-yellow-300 p-4 rounded">
            <h2 className="font-semibold mb-1">AI Summary:</h2>
            <pre className="text-sm whitespace-pre-wrap">{aiSummary}</pre>
          </div>
        )}
      </div>

      <LogListView
        logs={logs}
        selectedLog={selectedLog}
        setSelectedLog={setSelectedLog}
        visibleDate={visibleDate}
        setVisibleDate={setVisibleDate}
        getColorByLevel={(level) => {
          switch (level) {
            case "error": return "bg-red-100 border-red-300";
            case "warn": return "bg-yellow-100 border-yellow-300";
            case "info": return "bg-blue-100 border-blue-300";
            default: return "bg-white border-gray-200";
          }
        }}
      />

      <LogModal selectedLog={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
