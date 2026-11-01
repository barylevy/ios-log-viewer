import { useState } from 'react';

interface Props {
  maximumLine: number;
  onSelect: (lineNumber: number) => void;
  onClose: () => void;
}

export default function GoToLineDialog({ maximumLine, onSelect, onClose }: Props) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const lineNumber = parseInt(value.trim());
  const inRange = !Number.isNaN(lineNumber) && lineNumber >= 1 && lineNumber <= maximumLine;
  const invalid = (value !== '' || submitted) && !inRange;
  const submit = () => {
    setSubmitted(true);
    if (inRange) onSelect(lineNumber);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-label="Go to Line"
        aria-modal="true"
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-4 w-48"
      >
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Go to Line</h3>
        <div className="space-y-3">
          <input
            type="number"
            min="1"
            max={maximumLine}
            value={value}
            aria-invalid={invalid}
            onChange={(event) => {
              setValue(event.target.value);
              setSubmitted(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Enter line number"
            className={`w-full px-3 py-2 text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 ${
              invalid
                ? 'border-2 border-red-500 dark:border-red-400 focus:ring-red-500 dark:focus:ring-red-400'
                : 'border border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-blue-400'
            }`}
            autoFocus
          />
          <div className="flex items-center gap-2 justify-center">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
