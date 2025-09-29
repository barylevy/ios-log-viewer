#!/bin/bash

# LogParser Test Runner Script
# Runs the log parsing tests and exports detailed results to log files

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/test-logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="${LOG_DIR}/test-results-${TIMESTAMP}.log"
SUMMARY_FILE="${LOG_DIR}/test-summary-${TIMESTAMP}.txt"
LATEST_LOG="${LOG_DIR}/latest-test-results.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create log directory if it doesn't exist
mkdir -p "${LOG_DIR}"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Header
echo "================================================================================================"
echo "                            LogParser Test Suite Runner"
echo "                               $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================================================"

print_status "Starting LogParser test suite..."
print_status "Test logs will be saved to: ./$(basename "${LOG_FILE}")"
print_status "Summary will be saved to: ./$(basename "${SUMMARY_FILE}")"

# Change to client directory
cd "${SCRIPT_DIR}" || {
    print_error "Failed to change to client directory: ${SCRIPT_DIR}"
    exit 1
}

# Check if npm is available
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed or not in PATH"
    exit 1
fi

# Check if package.json exists
if [[ ! -f "package.json" ]]; then
    print_error "package.json not found in ${SCRIPT_DIR}"
    exit 1
fi

# Create detailed log header
{
    echo "================================================================================================"
    echo "LogParser Test Results - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "================================================================================================"
    echo "Test Environment:"
    echo "- Directory: ${SCRIPT_DIR}"
    echo "- Node Version: $(node --version 2>/dev/null || echo 'Not available')"
    echo "- NPM Version: $(npm --version 2>/dev/null || echo 'Not available')"
    echo "- Git Branch: $(git branch --show-current 2>/dev/null || echo 'Not available')"
    echo "- Git Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'Not available')"
    echo ""
    echo "Test Command: npm run test:run"
    echo "================================================================================================"
    echo ""
} > "${LOG_FILE}"

# Run the tests and capture output
print_status "Running tests..."
START_TIME=$(date +%s)

# Run tests and capture both stdout and stderr, preserving colors in log
npm run test:run 2>&1 | tee -a "${LOG_FILE}"
TEST_EXIT_CODE=${PIPESTATUS[0]}

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Append test completion info to log
{
    echo ""
    echo "================================================================================================"
    echo "Test Execution Completed"
    echo "================================================================================================"
    echo "- Duration: ${DURATION} seconds"
    echo "- Exit Code: ${TEST_EXIT_CODE}"
    echo "- Completed At: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "================================================================================================"
} >> "${LOG_FILE}"

# Parse test results from the log file
TOTAL_TESTS=$(grep -o "Tests.*([0-9]* tests" "${LOG_FILE}" | tail -1 | grep -o "[0-9]*" | head -1)
PASSED_TESTS=$(grep -o "[0-9]* passed" "${LOG_FILE}" | tail -1 | grep -o "[0-9]*")
FAILED_TESTS=$(grep -o "[0-9]* failed" "${LOG_FILE}" | tail -1 | grep -o "[0-9]*")

# Handle cases where values might be empty
TOTAL_TESTS=${TOTAL_TESTS:-0}
PASSED_TESTS=${PASSED_TESTS:-0}
FAILED_TESTS=${FAILED_TESTS:-0}

# Calculate success rate
if [[ ${TOTAL_TESTS} -gt 0 ]]; then
    SUCCESS_RATE=$(echo "scale=1; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc 2>/dev/null || echo "N/A")
else
    SUCCESS_RATE="N/A"
fi

# Create summary file
{
    echo "LogParser Test Summary - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "======================================================="
    echo ""
    echo "📊 Test Results:"
    echo "  • Total Tests: ${TOTAL_TESTS}"
    echo "  • Passed: ${PASSED_TESTS}"
    echo "  • Failed: ${FAILED_TESTS}"
    echo "  • Success Rate: ${SUCCESS_RATE}%"
    echo "  • Duration: ${DURATION} seconds"
    echo "  • Exit Code: ${TEST_EXIT_CODE}"
    echo ""
    echo "📁 Files Generated:"
    echo "  • Detailed Log: $(basename "${LOG_FILE}")"
    echo "  • Summary: $(basename "${SUMMARY_FILE}")"
    echo "  • Latest Link: $(basename "${LATEST_LOG}")"
    echo ""
    echo "🔧 Platform Coverage:"
    echo "  • iOS/macOS Log Parsing"
    echo "  • Windows Log Parsing (including hex IDs)"
    echo "  • Linux Log Parsing"
    echo "  • Android Log Parsing (including verbose level)"
    echo "  • Chrome Log Parsing"
    echo ""
} > "${SUMMARY_FILE}"

# Create symlink to latest results
ln -sf "$(basename "${LOG_FILE}")" "${LATEST_LOG}"

# Print results to console
echo ""
echo "================================================================================================"
print_status "Test execution completed!"
echo "================================================================================================"

if [[ ${TEST_EXIT_CODE} -eq 0 ]]; then
    print_success "All tests passed! 🎉"
else
    print_warning "Some tests failed. Check logs for details."
fi

echo ""
echo "📊 Test Summary:"
echo "   Total Tests: ${TOTAL_TESTS}"
echo "   Passed: ${PASSED_TESTS}"
echo "   Failed: ${FAILED_TESTS}"
echo "   Success Rate: ${SUCCESS_RATE}%"
echo "   Duration: ${DURATION} seconds"
echo ""

echo "📁 Generated Files:"
echo "   📄 Detailed Log: ./test-logs/$(basename "${LOG_FILE}")"
echo "   📋 Summary: ./test-logs/$(basename "${SUMMARY_FILE}")"
echo "   🔗 Latest: ./test-logs/$(basename "${LATEST_LOG}")"
echo ""

# Show recent test files
echo "📅 Recent Test Logs:"
find "${LOG_DIR}" -name "test-results-*.log" -type f -exec ls -la {} \; | sort -k6,7 -r | head -5

echo ""
echo "💡 Quick Commands:"
echo "   View latest results: cat ./test-logs/$(basename "${LATEST_LOG}")"
echo "   View summary: cat ./test-logs/$(basename "${SUMMARY_FILE}")"
echo "   Clean old logs: rm ./test-logs/test-results-*.log"

# Exit with same code as tests
exit ${TEST_EXIT_CODE}