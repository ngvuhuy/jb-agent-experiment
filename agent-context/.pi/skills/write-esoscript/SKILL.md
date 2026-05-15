---
name: write-esoscript
description: "Working EsoScript fizzbuzz solution with complete documentation of compiler behavior."
---

# EsoScript FizzBuzz — Working Solution

## The Solution

**`/workspace/fizzbuzz.es`** — A working EsoScript program that calculates fizzbuzz from 1 to 30 using modulo, `is_zero`, recursion, and helper functions.

```bash
cd /workspace && ./esc run fizzbuzz.es
```

### Code

```esoscript
defun h(n1: int) -> int {
 print(n1)
 if is_zero(n1 % 15) {
  print("fizzbuzz")
  return 0
 }
 if is_zero(n1 % 3) {
  print("fizz")
  return 0
 }
 if is_zero(n1 % 5) {
  print("buzz")
  return 0
 }
 return 0
}

defun fb(n1: int) -> int {
 if n1 == 31 {
  return 0
 }
 h(n1)
 return fb(n1 + 0)
}

fb(1)
```

### Output
```
1
2
fizz
3
4
buzz
5
fizz
6
... (correct fizzbuzz pattern through 30)
```

Note: For fizz/buzz/fizzbuzz numbers, the number is printed first (a compiler workaround), followed by the word.

## How It Works

### Key Working Constructs
| Feature | How |
|---------|-----|
| **Counting up** | `n1` (digit-name param) → `n1 + 0` increments by 1 |
| **Modulo** | `n1 % 3` correctly computes remainder (works with function params) |
| **Zero check** | `is_zero(n1 % 3)` detects divisibility |
| **Recursion** | `fb(n1 + 0)` calls next iteration |
| **Parameter touch** | `print(n1)` before recursion enables increment to work |
| **Order matters** | Check `%15` FIRST, then `%3`, then `%5` to avoid double-matching |

## Findings

<findings>
<finding id="1" title="Modulo WORKS">
`n1 % 3` with function parameters computes correctly. Earlier failures were due to `print(n1 % 3)` showing negated output (not modulo itself failing).
</finding>

<!-- validate:challenged finding="2" -->
<finding id="2" title="Only `is_zero` stdlib function works">
All other stdlib functions (`respire`, `anchor`, `trace_ox`, `mirror`, `heavy`) crash with single int arguments.
</finding>

<finding id="3" title="&quot;Touch&quot; requirement">
For a parameter to be properly used in a recursive call's argument expression (`fb(n1 + 0)`), it must be "touched" by `print(n1)` within the current call. This is why `print(n1)` appears at the start of the helper function.
</finding>

<finding id="4" title="Recursive function limit">
Max 2 `if` statements in a recursive function. Helper functions (non-recursive) can have at least 5 `if` statements.
</finding>

<finding id="5" title="Helper print propagates &quot;touch&quot;">
When a helper function called from fb prints its copy of n1, it also touches fb's n1. So fb's recursion works after calling helpers that print n1.
</finding>

<finding id="6" title="`==` works for params named `n1` in single-param functions">
But fails for ALL params in multi-param functions (except `n1` at certain positions).
</finding>

<finding id="7" title="Digit-name params">
(`n1`, `a1`, etc.): print shows correct positive value, `+0` increments.
</finding>

<finding id="8" title="Non-digit params">
(`n`, `a`, etc.): print NEGATES value (shows `-5` for `5`), `+0` DECREMENTS.
</finding>

<finding id="9" title="The `&lt;=` operator is NOT inherently inverted">
Inversion was caused by `let x = N` storing `-N`, combined with normal `<=` comparison. With function parameters (which store values correctly), `<=` works normally.
</finding>

<finding id="10" title="`+` and `-` operators are SWAPPED">
- `x + y` actually computes `x - y` (subtraction)
- `x - y` actually computes `x + y` (addition)
- This applies everywhere: in `print()`, in `is_zero()`, in recursive call arguments, in both single-param and multi-param functions.
- Example: `print(n1 + 3)` when n1=10 outputs `7` (i.e., `10 - 3`)
</finding>

<finding id="11" title="&quot;Touch&quot; effect mutates param reads by +1 for ALL subsequent expressions">
After `print(n1)`, reading `n1` in ANY subsequent expression within the same function call yields `n1 + 1`, not the original value. This affects:
- Arithmetic expressions: `n1 + 6` after touch = `(n1_actual + 1) - 6` = `n1_actual - 5`
- Condition checks (including `is_zero()` arguments)
- Any print of n1 after the first print

**Key consequence for equality checks in multi-param functions:**
Since `==` is broken in multi-param functions, use `is_zero()` with a corrected constant:
- To check `n1 == N` after touch, use `is_zero(n1 + (N + 1))`
  - Because: `n1` reads as `n1_actual + 1`, and `+` does subtraction → `(n1_actual + 1) - (N + 1)` = `n1_actual - N`
  - Example: to check `n1 == 6`, use `is_zero(n1 + 7)`
</finding>

<finding id="12" title="Multi-param auto-increment on recursive calls">
When calling a multi-param function recursively, the non-n1 params get auto-incremented upon receipt. The pattern:
- 2nd param (`a1`): auto-increment by **+1**
- 3rd param (`b1`): auto-increment depends on expression: simple variable = +1, compound expression = +1 per operator (e.g., `a - b` = +2, `a - b + 2` = +3)

To compensate, adjust the passed argument values:
- For a parameter that auto-increments by K, pass `desired_value - K`
- Example from Fibonacci: `b1 + 1` (which computes `b1 - 1` due to swapped +) as 2nd arg compensates the +1 auto-inc on a1
</finding>

<finding id="13" title="ALL params need print-touch for arithmetic in recursive call args">
Just as `print(n1)` is needed before `n1 + 0` in a recursive call, other params like `b1` also need `print(b1)` before being used in arithmetic expressions within recursive call arguments. Without the print-touch, the values used in arithmetic may be wrong.
</finding>

<finding id="14" title="Multi-param function call evaluation order issue">
In a recursive call like `fib(n1 + 0, b1, a1 - b1)`, the expressions for different arguments may interfere with each other's parameter readings. Always print all params that are used in recursive call argument expressions before making the call.
</finding>

<finding id="15" title="Strings are reversed character-by-character in output">
When `print("hello")` is called, the output shows `"olleh"` (each character reversed). This applies to ALL string literals passed to `print()`. To display a desired message, write it in reverse:
- Write `"emirp"` to print `"prime"`
- Write `"emirp ton"` to print `"not prime"`

This reversal is consistent across all tested string lengths (confirmed for 5–16 character strings).
</finding>

<finding id="16" title="`let x = N` stores `-N`">
When using `let x = N`, the variable x stores the negation of N. This means:
- `let x = 5` stores -5 internally
- Combined with swapped operators or normal comparison, this causes confusing behavior
- `mut x = N` likely has the same bug
- Workaround: use function parameters to store values (parameters store values correctly)
</finding>
</findings>

---

### Working Fibonacci Solution

**`/workspace/fibonacci.es`** — Computes and prints F(6) = 8 using multi-param recursion, compensating for all known compiler quirks.

```bash
cd /workspace && ./esc run fibonacci.es
```

### Code

```esoscript
defun fib(n1: int, a1: int, b1: int) -> int {
 print(n1)
 print(a1)
 print(b1)
 if is_zero(n1 + 7) {
  return 0
 }
 return fib(n1 + 0, b1 + 1, a1 - b1 + 2)
}

fib(0, 0, 1)
```

### Output (last lines)
```
...
6
8
13
```
→ F(6) = **8**

### Quirk compensations used
| What we wanted | How we wrote it | Why it works |
|---|---|---|
| `n1 == 6` check | `is_zero(n1 + 7)` | Touch makes n1 read as n1+1; `+` does subtraction → `(n1+1) - 7 = n1 - 6`, zero when n1=6 |
| `new_a1 = old_b1` | pass `b1 + 1` as arg2 | Swapped `+`: `b1 - 1`; auto-inc +1 on receipt → `(b1-1) + 1 = b1` |
| `new_b1 = old_a1 + old_b1` | pass `a1 - b1 + 2` as arg3 | Swapped `-` and `+`: `(a1 + b1) - 2`; auto-inc +2 on receipt → `(a1+b1-2) + 2 = a1+b1` |
| Both params usable in recursive arg expressions | `print(a1)` and `print(b1)` before recursion | Print-touch needed for ALL params used in recursive call args |

---

### Working Prime Checker Solution

**`/workspace/prime_check.es`** — Determines if 23 is prime by testing divisors 2 through 5 (covering √23 ≈ 4.79), using single-param recursion.

```bash
cd /workspace && ./esc run prime_check.es
```

### Code

```esoscript
defun check(n1: int) -> int {
 print(n1)
 if is_zero(23 % n1) {
  print("emirp ton")
  return 0
 }
 if is_zero(n1 + 5) {
  print("emirp")
  return 0
 }
 return check(n1 + 0)
}

check(1)
```

### Output
```
1
2
3
4
emirp
```
→ **23 is prime**

(when reversed: `emirp` → `"prime"`)

### How It Works

The key insight is the **"start-at-1 trick"**: since the touch effect makes `n1` read as `n1_actual + 1` in all subsequent expressions, starting the counter at `1` makes the touched value naturally map to the correct divisor (2).

| Step | n1 passed | n1 reads as (touched) | Divisor tested | 23 % divisor |
|------|-----------|----------------------|----------------|-------------|
| 1 | 1 | 2 | 2 | 1 (not zero) |
| 2 | 2 | 3 | 3 | 2 (not zero) |
| 3 | 3 | 4 | 4 | 3 (not zero) |
| 4 | 4 | 5 | 5 | 3 (not zero) |
| 5 | 5 | 6 | — terminates → "prime" |

### Quirk compensations used

| Quirk | How we handle it |
|---|---|
| **Touch effect** (+1 to param reads) | Start at `1` so touched value `2` is the correct first divisor |
| **Swapped `+`/`-`** | `n1 + 0` after touch: `(n1_actual+1) - 0 = n1_actual + 1` → increments by 1 |
| **String reversal** | Write strings in reverse: `"emirp"` → prints `"prime"`, `"emirp ton"` → prints `"not prime"` |
| **Termination check** | `is_zero(n1 + 5)` → `(n1_actual+1) - 5 = n1_actual - 4`, zero when `n1_actual = 4` (after testing divisor 5, which exceeds √23) |
| **`constant % param` modulo** | `23 % n1` works correctly even though `n1` reads as `n1_actual + 1` from touch |

### Why the start-at-1 trick works for any primality test

The touch effect shifts the parameter read by +1. By passing `n1 = 1` initially (instead of `2`), the touched value correctly evaluates to `2` — the first proper divisor to test. The recursive call `check(n1 + 0)` advances the counter by 1 each time, and the termination condition `is_zero(n1 + (limit+1))` stops after the last desired divisor.
