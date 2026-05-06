import React, { useState, useEffect, useRef } from 'react';

const AVAILABLE_COLUMNS = [
  { id: 'timestamp', label: 'Timestamp', defaultVisible: true },
  { id: 'lineNumber', label: 'Line Number', defaultVisible: true },
  { id: 'logLevel', label: 'Log Level', defaultVisible: true },
  { id: 'message', label: 'Message', defaultVisible: true, disabled: true }, // Message is always visible
  { id: 'module', label: 'Module', defaultVisible: true },
  { id: 'sourceFile', label: 'Source File', defaultVisible: true },
  { id: 'processThread', label: 'P:T', defaultVisible: true },
  { id: 'timeGap', label: 'Time Gap', defaultVisible: true },
];

const DEFAULT_RIGHT_COLUMN_ORDER = ['timestamp', 'lineNumber', 'logLevel', 'message', 'module', 'sourceFile', 'timeGap', 'processThread'];

const ColumnSettings = ({
  isOpen,
  onClose,
  visibleColumns,
  onColumnsChange,
  rightColumnOrder = DEFAULT_RIGHT_COLUMN_ORDER,
  onRightColumnOrderChange,
}) => {
  const [tempColumns, setTempColumns] = useState(visibleColumns);
  const [tempOrder, setTempOrder] = useState(rightColumnOrder);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const draggingIdRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTempColumns(visibleColumns);
      setTempOrder(rightColumnOrder);
    }
  }, [isOpen, visibleColumns, rightColumnOrder]);

  if (!isOpen) return null;

  const handleToggle = (columnId) => {
    setTempColumns(prev => ({ ...prev, [columnId]: !prev[columnId] }));
  };

  const handleDragStart = (id) => (e) => {
    draggingIdRef.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const handleDragOver = (id) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverId) setDragOverId(id);
  };
  const handleDragLeave = (id) => () => {
    setDragOverId(prev => (prev === id ? null : prev));
  };
  const handleDrop = (targetId) => (e) => {
    e.preventDefault();
    const dragId = draggingIdRef.current;
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
    if (!dragId || dragId === targetId) return;
    setTempOrder(prev => {
      const next = prev.filter(id => id !== dragId);
      const idx = next.indexOf(targetId);
      if (idx === -1) return prev;
      next.splice(idx, 0, dragId);
      return next;
    });
  };
  const handleDragEnd = () => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleSave = () => {
    onColumnsChange(tempColumns);
    localStorage.setItem('logViewerColumns', JSON.stringify(tempColumns));
    if (typeof onRightColumnOrderChange === 'function') {
      onRightColumnOrderChange(tempOrder);
    }
    onClose();
  };

  const handleReset = () => {
    const defaultColumns = {};
    AVAILABLE_COLUMNS.forEach(col => {
      defaultColumns[col.id] = col.defaultVisible;
    });
    setTempColumns(defaultColumns);
    setTempOrder(DEFAULT_RIGHT_COLUMN_ORDER.slice());
  };

  const lookup = Object.fromEntries(AVAILABLE_COLUMNS.map(c => [c.id, c]));
  const seen = new Set();
  const orderedColumns = [];
  tempOrder.forEach(id => {
    if (lookup[id] && !seen.has(id)) {
      orderedColumns.push(lookup[id]);
      seen.add(id);
    }
  });
  AVAILABLE_COLUMNS.forEach(col => {
    if (!seen.has(col.id)) orderedColumns.push(col);
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Column Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-2 flex-1 overflow-y-auto">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Toggle visibility and drag rows to reorder columns in the log row.
          </p>

          {orderedColumns.map((column) => (
            <ColumnRow
              key={column.id}
              column={column}
              checked={!!tempColumns[column.id]}
              onToggle={() => handleToggle(column.id)}
              isDragging={draggingId === column.id}
              isDragOver={dragOverId === column.id && draggingId && draggingId !== column.id}
              onDragStart={handleDragStart(column.id)}
              onDragOver={handleDragOver(column.id)}
              onDragLeave={handleDragLeave(column.id)}
              onDrop={handleDrop(column.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            Reset to Default
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ColumnRow = ({ column, checked, onToggle, isDragging, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }) => {
  const dragClass = [
    isDragging ? 'opacity-50' : '',
    isDragOver ? 'ring-2 ring-blue-400 dark:ring-blue-500' : '',
  ].filter(Boolean).join(' ');
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center justify-between p-3 rounded-md cursor-grab active:cursor-grabbing bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 ${dragClass}`}
      title="Drag to reorder"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-gray-400 dark:text-gray-500 select-none" aria-hidden="true">⋮⋮</span>
        <label
          htmlFor={`column-${column.id}`}
          className={`text-sm font-medium text-gray-700 dark:text-gray-300 truncate ${
            column.disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          {column.label}
          {column.disabled && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(Required)</span>
          )}
        </label>
      </div>

      <input
        id={`column-${column.id}`}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        disabled={column.disabled}
        className={`w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 ${
          column.disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
      />
    </div>
  );
};

export { AVAILABLE_COLUMNS };
export default ColumnSettings;
