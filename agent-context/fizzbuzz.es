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
