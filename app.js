/* Pro Calculator
 * - Accurate math with operator precedence
 * - Business-correct percentage behavior (not modulo)
 * - Division by zero and invalid inputs show clear error
 * - Keyboard support and robust input handling
 */

// State
let expressionTokens = []; // tokens of numbers and operators
let currentInput = "";     // active number being typed
let lastResult = null;     // last evaluated result
let isError = false;

const exprEl = document.getElementById("expression");
const resEl = document.getElementById("result");

const keys = document.querySelectorAll(".key");

// Utility: safe rounding to avoid binary float artifacts
function roundSmart(n, maxDigits = 12) {
  // Convert to string with limited precision, then trim trailing zeros
  const s = Number(n).toPrecision(Math.min(maxDigits, 15));
  // If scientific notation appears for very small/large, preserve but normalize
  let num = Number(s);
  if (!Number.isFinite(num)) return n.toString();

  // Fixed up to 12 decimal places, then trim
  let fixed = num.toFixed(12);
  fixed = fixed.replace(/\.?0+$/, ""); // remove trailing zeros and dot
  return fixed;
}

// Display helpers
function updateDisplay() {
  const exprText = expressionTokens.join(" ");
  exprEl.textContent = exprText;
  resEl.textContent = isError ? "Error" : (currentInput ? currentInput : (lastResult !== null ? roundSmart(lastResult) : "0"));
  resEl.classList.toggle("error", isError);
}

function clearAll() {
  expressionTokens = [];
  currentInput = "";
  lastResult = null;
  isError = false;
  updateDisplay();
}

function clearEntry() {
  if (isError) return;
  currentInput = "";
  updateDisplay();
}

function backspace() {
  if (isError) return;
  if (currentInput.length) {
    currentInput = currentInput.slice(0, -1);
  } else if (expressionTokens.length) {
    const last = expressionTokens[expressionTokens.length - 1];
    if (/^\d|\./.test(last)) {
      currentInput = last.toString().slice(0, -1);
      expressionTokens.pop();
    } else {
      expressionTokens.pop();
    }
  }
  updateDisplay();
}

function appendDigit(d) {
  if (isError) return;
  // Prevent leading zeros like "00"
  if (currentInput === "0" && d !== ".") {
    currentInput = d;
  } else {
    currentInput += d;
  }
  updateDisplay();
}

function appendDot() {
  if (isError) return;
  if (!currentInput.includes(".")) {
    currentInput = currentInput ? currentInput + "." : "0.";
    updateDisplay();
  }
}

function negate() {
  if (isError) return;
  if (currentInput) {
    if (currentInput.startsWith("-")) currentInput = currentInput.slice(1);
    else currentInput = "-" + currentInput;
  } else {
    // If no current input, toggle last result (preview)
    if (lastResult !== null) {
      lastResult = -lastResult;
    }
  }
  updateDisplay();
}

// Commit current input to tokens
function commitCurrent() {
  if (currentInput !== "") {
    expressionTokens.push(currentInput);
    currentInput = "";
  }
}

// Operator handling including %
function pushOperator(op) {
  if (isError) return;
  // Prevent two operators in a row (except allowing % as unary on a number)
  if (op === "%") {
    // Percent applies to current input or last number token
    applyPercent();
    return;
  }

  // If there's no number yet, allow leading minus for negative
  if (!expressionTokens.length && !currentInput) {
    if (op === "-") {
      currentInput = "-";
      updateDisplay();
      return;
    } else {
      // Other operators not allowed at start
      return;
    }
  }

  // Commit any current number
  commitCurrent();

  // Avoid duplicate operators
  const last = expressionTokens[expressionTokens.length - 1];
  if (["+", "-", "*", "/"].includes(last)) {
    expressionTokens[expressionTokens.length - 1] = op;
  } else {
    expressionTokens.push(op);
  }
  updateDisplay();
}

// Percentage behavior:
// - If pattern is [A, +/-, B] and % pressed, transform B -> (A * B/100)
// - If pattern is [A, */ , B] and % pressed, transform B -> (B/100)
// - If only [B] or current input B, transform to B/100
function applyPercent() {
  if (isError) return;

  if (currentInput !== "") {
    // We have B in currentInput
    const B = parseFloat(currentInput);
    if (!Number.isFinite(B)) return;

    let A = null;
    let op = null;

    if (expressionTokens.length >= 2) {
      const prevOp = expressionTokens[expressionTokens.length - 1];
      const prevNum = parseFloat(expressionTokens[expressionTokens.length - 2]);
      if (Number.isFinite(prevNum) && ["+", "-", "*", "/"].includes(prevOp)) {
        A = prevNum; op = prevOp;
      }
    }

    let transformed;
    if (A !== null && (op === "+" || op === "-")) {
      transformed = A * (B / 100); // percentage of A
    } else {
      transformed = B / 100; // standalone or with * or /
    }

    currentInput = roundSmart(transformed);
    updateDisplay();
    return;
  }

  // If no current input, apply to last numeric token
  if (expressionTokens.length) {
    const last = expressionTokens[expressionTokens.length - 1];
    if (!["+", "-", "*", "/"].includes(last)) {
      const B = parseFloat(last);
      if (!Number.isFinite(B)) return;

      let A = null;
      let op = null;

      if (expressionTokens.length >= 3) {
        const prevOp = expressionTokens[expressionTokens.length - 2];
        const prevNum = parseFloat(expressionTokens[expressionTokens.length - 3]);
        if (Number.isFinite(prevNum) && ["+", "-", "*", "/"].includes(prevOp)) {
          A = prevNum; op = prevOp;
        }
      }

      let transformed;
      if (A !== null && (op === "+" || op === "-")) {
        transformed = A * (B / 100);
      } else {
        transformed = B / 100;
      }

      expressionTokens[expressionTokens.length - 1] = roundSmart(transformed);
      updateDisplay();
    }
  }
}

// Expression evaluation with operator precedence.
// Uses a shunting-yard style conversion to RPN, then evaluates.
// Returns { ok: boolean, value?: number, error?: string }
function evaluateTokens(tokens) {
  const output = [];
  const ops = [];

  const precedence = { "+": 1, "-": 1, "*": 2, "/": 2 };

  function applyOp(op) {
    if (output.length < 2) return { ok: false, error: "Malformed expression" };
    const b = Number(output.pop());
    const a = Number(output.pop());
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, error: "Invalid number" };
    let v;
    if (op === "+") v = a + b;
    else if (op === "-") v = a - b;
    else if (op === "*") v = a * b;
    else if (op === "/") {
      if (b === 0) return { ok: false, error: "Division by zero" };
      v = a / b;
    } else return { ok: false, error: "Unknown operator" };
    output.push(v);
    return { ok: true };
  }

  // Validate and convert to RPN
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (["+", "-", "*", "/"].includes(t)) {
      // Operator
      while (ops.length && precedence[ops[ops.length - 1]] >= precedence[t]) {
        const res = applyOp(ops.pop());
        if (!res.ok) return res;
      }
      ops.push(t);
    } else {
      // Number token
      const n = Number(t);
      if (!Number.isFinite(n)) return { ok: false, error: "Invalid number" };
      output.push(n);
    }
  }

  while (ops.length) {
    const res = applyOp(ops.pop());
    if (!res.ok) return res;
  }

  if (output.length !== 1) return { ok: false, error: "Malformed expression" };
  const value = output[0];
  if (!Number.isFinite(value)) return { ok: false, error: "Overflow" };
  return { ok: true, value };
}

function equals() {
  if (isError) return;
  // Commit any pending number
  commitCurrent();

  // Avoid trailing operator
  const last = expressionTokens[expressionTokens.length - 1];
  if (["+", "-", "*", "/"].includes(last)) {
    expressionTokens.pop();
  }

  if (!expressionTokens.length) {
    lastResult = lastResult !== null ? lastResult : 0;
    updateDisplay();
    return;
  }

  const res = evaluateTokens(expressionTokens);
  if (!res.ok) {
    isError = true;
    lastResult = null;
    updateDisplay();
    return;
  }

  lastResult = res.value;
  // After equals, set expression to the result for continuous operations
  expressionTokens = [roundSmart(lastResult)];
  currentInput = "";
  updateDisplay();
}

// Keyboard support
function handleKey(e) {
  const k = e.key;

  if (/\d/.test(k)) { appendDigit(k); return; }
  if (k === ".") { appendDot(); return; }
  if (k === "+") { pushOperator("+"); return; }
  if (k === "-") { pushOperator("-"); return; }
  if (k === "*") { pushOperator("*"); return; }
  if (k === "/") { pushOperator("/"); return; }
  if (k === "%") { applyPercent(); return; }
  if (k === "Enter" || k === "=") { equals(); return; }
  if (k === "Escape") { clearAll(); return; }
  if (k === "Backspace") { backspace(); return; }
}

document.addEventListener("keydown", handleKey);

// Click handling
keys.forEach(btn => {
  btn.addEventListener("click", () => {
    const val = btn.dataset.value;
    const action = btn.dataset.action;

    if (action === "ac") { clearAll(); return; }
    if (action === "clear") { clearEntry(); return; }
    if (action === "backspace") { backspace(); return; }
    if (action === "dot") { appendDot(); return; }
    if (action === "negate") { negate(); return; }
    if (action === "equals") { equals(); return; }

    if (val !== undefined) {
      if (["+", "-", "*", "/", "%"].includes(val)) {
        pushOperator(val);
      } else {
        appendDigit(val);
      }
    }
  });
});

// Initialize
clearAll();
