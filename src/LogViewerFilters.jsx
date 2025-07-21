import React from "react";

export default function LogViewerFilters({
  filterTextInput, setFilterTextInput,
  filterStart, setFilterStart,
  filterEnd, setFilterEnd,
  contextLines, setContextLines,
  removeDuplicates, setRemoveDuplicates,
  logCount
}) {
  return (
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
          > ✖️
          </button>
        )}
      </div>
      <input type="datetime-local" step="0.001" className="min-w p-2 border rounded text-sm" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
      <input type="datetime-local" step="0.001" className="min-w p-2 border rounded text-sm" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
      <input type="number" title="Show lines above/below the filtered line." min="0" className="w-16 p-2 border rounded text-sm" value={contextLines} onChange={(e) => setContextLines(Number(e.target.value))} />
      <label className="flex items-center space-x-1 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={removeDuplicates} onChange={(e) => setRemoveDuplicates(e.target.checked)} />
        <span>Remove duplicates</span>
      </label>
      <div className="text-sm text-gray-600 dark:text-gray-300">Showing: <strong>{logCount}</strong> records</div>
    </div>
  );
}
