import React from "react";
import { FixedSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";

export default function LogListView({ logs, selectedLog, setSelectedLog, visibleDate, setVisibleDate, getColorByLevel }) {
  return (
    <div style={{ height: "75vh" }} className="border rounded">
      <div className="text-gray-500 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-700 px-2 py-1 text-sm">
        Date: {visibleDate}
      </div>
      <AutoSizer>
        {({ height, width }) => (
          <List
            height={height}
            itemCount={logs.length}
            itemSize={28}
            width={width}
            onItemsRendered={({ visibleStartIndex }) => {
              const log = logs[visibleStartIndex];
              if (log?.date) setVisibleDate(log.date);
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
                    ${log.isMatch ? "font-semibold bg-white dark:bg-gray-800" : ""}
                    ${log.context && !log.isMatch ? "opacity-60 italic" : ""}
                    ${log.isMalformed ? "bg-orange-50 dark:bg-orange-900" : getColorByLevel(log.level)}
                    ${index % 2 === 1 ? "bg-gray-50 dark:bg-gray-800" : ""}
                    hover:bg-gray-100 dark:hover:bg-gray-700 transition
                  `}
                >
                  <div className="grid grid-cols-5 gap-1 items-start">
                    <div className="text-gray-500 flex items-center gap-2">
                      {!log.isMalformed && log.time}
                      <span className="text-[10px] text-gray-400">#{log.lineNumber}</span>
                    </div>
                    <div className="col-span-4 flex justify-between gap-4 text-gray-800 dark:text-gray-200 truncate">
                      <span className="truncate">{log.message}</span>
                      <span className="flex-shrink-0 text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        {log.location && <span className="text-blue-600 dark:text-blue-400 font-medium">{log.location}</span>}
                        {log.module && <span className="text-gray-500 dark:text-gray-400">[{log.module}]</span>}
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
  );
}
