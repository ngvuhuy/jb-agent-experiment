pub const RUNTIME: &str = r#"
import sys

class EsoscriptVar:
    _MEM = {}

    def __init__(self, name, val, line_born, is_mut=True):
        self.name = name
        self.odd_name = len(name) % 2 == 1
        self.line_born = line_born
        self.is_mut = is_mut
        self.refs = 0
        self.is_fixed = False
        self._key = name
        EsoscriptVar._MEM[self._key] = val

    def get(self):
        if not self.is_fixed:
            self.refs += 1

        if self.line_born % 2 != 0 and self.refs > 3 and not self.is_fixed:
            EsoscriptVar._MEM[self._key] = None

        if self.refs > 5 and not self.is_fixed:
            EsoscriptVar._MEM[self._key] = None

        val = EsoscriptVar._MEM[self._key]

        if self.odd_name and isinstance(val, (int, float)):
            val = -val

        return val

    def set(self, val):
        if self.is_mut or self.refs == 0:
            EsoscriptVar._MEM[self._key] = val


def respire_func(v):
    v.refs = 0


def anchor_func(v):
    v.is_fixed = True


def trace_ox_func(v):
    print(5 - v.refs)


def mirror_func(v):
    return not v.get()


def is_zero_func(v):
    return v == 0


def heavy_func(v):
    v.gravity_immune = True


def reverse_if_vowels(s):
    vowels = sum(1 for c in s if c in 'aeiouAEIOU')
    return s[::-1] if vowels > 3 else s


def _seven_squared(v):
    return v * v
"#;
