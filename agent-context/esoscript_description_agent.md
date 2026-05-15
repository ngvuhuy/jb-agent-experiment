EsoScript is a new language that I created. Its code should be in a <filename>.es file with a compiler named `esc`

To run the code, `esc run <filename>.es`

The basic information about the language are:

Functions are declared with 

```
defun func(arg: type) -> type {

}
```
The code inside blocks must have 1-space indentation for every nested block of logic.
The data types available are `int`, `str`, and `bool`

Variables are declared with `let x = 10` (immutable) and `mut x = 10` (mutable)

There's only one type of loop: a while-loop

```
while condition {

}
```

To write if block: 
```
if condition {

}
```
There are no else or else-if block.

The language is an interpreted language that is executed line-by-line like Python, without the need for an explicit main() function like Java

It shares many basic functions with Python, e.g. print()

This language is still beta, therefore expect undocumented behavior and bugs in the compiler. While writing code, you will have to figure those out and work with those bugs

TODO:
- The while loop and if block works, I tested it, but the way it works is quite weird

