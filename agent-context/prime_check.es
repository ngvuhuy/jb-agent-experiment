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
