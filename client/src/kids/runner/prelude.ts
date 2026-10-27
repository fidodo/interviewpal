// Python run once after Pyodide loads. It installs a lightweight `turtle` module that records drawing
// commands instead of opening a window, and replaces input() (there's no console to type into).
// Keep the supported turtle API in sync with RUNTIME in server/src/kids/kids.prompts.ts.
export const PRELUDE = `
import sys, math, json, types, builtins

_MAX_STEPS = 20000
_state = {"lines": [], "dots": [], "bg": None}
_turtles = []

def _color_name(args):
    if len(args) == 3:
        args = (tuple(args),)
    c = args[0]
    if isinstance(c, (tuple, list)):
        vals = [float(v) for v in c[:3]]
        if all(v <= 1 for v in vals):
            vals = [v * 255 for v in vals]
        return "rgb(%d,%d,%d)" % tuple(int(v) for v in vals)
    return str(c)

class Turtle:
    def __init__(self, *args, **kwargs):
        self._x = 0.0
        self._y = 0.0
        self._h = 0.0
        self._down = True
        self._color = "black"
        self._size = 2.0
        _turtles.append(self)

    def _check(self):
        if len(_state["lines"]) + len(_state["dots"]) >= _MAX_STEPS:
            raise RuntimeError("The turtle took too many steps. Is there a loop that never stops?")

    def _move_to(self, nx, ny):
        if self._down:
            self._check()
            _state["lines"].append([round(self._x, 2), round(self._y, 2), round(nx, 2), round(ny, 2), self._color, self._size])
        self._x, self._y = nx, ny

    def forward(self, distance):
        r = math.radians(self._h)
        d = float(distance)
        self._move_to(self._x + d * math.cos(r), self._y + d * math.sin(r))
    fd = forward

    def backward(self, distance):
        self.forward(-float(distance))
    back = bk = backward

    def left(self, angle):
        self._h = (self._h + float(angle)) % 360
    lt = left

    def right(self, angle):
        self._h = (self._h - float(angle)) % 360
    rt = right

    def penup(self):
        self._down = False
    pu = up = penup

    def pendown(self):
        self._down = True
    pd = down = pendown

    def isdown(self):
        return self._down

    def pencolor(self, *args):
        if not args:
            return self._color
        self._color = _color_name(args)

    def color(self, *args):
        if not args:
            return self._color
        self.pencolor(args[0])

    def fillcolor(self, *args):
        pass

    def pensize(self, width=None):
        if width is None:
            return self._size
        self._size = max(1.0, float(width))
    width = pensize

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._move_to(float(x), float(y))
    setpos = setposition = goto

    def setx(self, x):
        self.goto(x, self._y)

    def sety(self, y):
        self.goto(self._x, y)

    def setheading(self, angle):
        self._h = float(angle) % 360
    seth = setheading

    def home(self):
        self.goto(0, 0)
        self._h = 0.0

    def position(self):
        return (round(self._x, 2), round(self._y, 2))
    pos = position

    def xcor(self):
        return round(self._x, 2)

    def ycor(self):
        return round(self._y, 2)

    def heading(self):
        return self._h

    def circle(self, radius, extent=360, steps=None):
        radius = float(radius)
        extent = float(extent)
        n = int(steps) if steps else max(12, int(abs(extent) / 6))
        step_angle = extent / n
        step_len = 2 * abs(radius) * math.sin(math.radians(abs(step_angle)) / 2)
        turn = step_angle if radius >= 0 else -step_angle
        self.left(turn / 2)
        for _ in range(n):
            self.forward(step_len)
            self.left(turn)
        self.left(-turn / 2)

    def dot(self, size=None, *color):
        self._check()
        c = _color_name(color) if color else self._color
        _state["dots"].append([round(self._x, 2), round(self._y, 2), float(size or max(self._size + 4, self._size * 2)), c])

    def begin_fill(self): pass
    def end_fill(self): pass
    def speed(self, *args): pass
    def shape(self, *args): pass
    def hideturtle(self): pass
    ht = hideturtle
    def showturtle(self): pass
    st = showturtle
    def write(self, *args, **kwargs): pass
    def clear(self): pass

class _Screen:
    def bgcolor(self, *args):
        if args:
            _state["bg"] = _color_name(args)
    def setup(self, *args, **kwargs): pass
    def title(self, *args): pass
    def tracer(self, *args, **kwargs): pass
    def update(self): pass
    def exitonclick(self): pass
    def mainloop(self): pass

_screen = _Screen()
_default = None

def _kids_reset():
    global _default
    _state["lines"] = []
    _state["dots"] = []
    _state["bg"] = None
    _turtles.clear()
    _default = Turtle()

def _delegate(name):
    return lambda *args, **kwargs: getattr(_default, name)(*args, **kwargs)

_mod = types.ModuleType("turtle")
_mod.Turtle = _mod.Pen = _mod.RawTurtle = Turtle
_mod.Screen = lambda: _screen
for _name in ["forward", "fd", "backward", "back", "bk", "left", "lt", "right", "rt", "penup", "pu", "up",
              "pendown", "pd", "down", "isdown", "pencolor", "color", "fillcolor", "pensize", "width", "goto",
              "setpos", "setposition", "setx", "sety", "setheading", "seth", "home", "position", "pos", "xcor",
              "ycor", "heading", "circle", "dot", "begin_fill", "end_fill", "speed", "shape", "hideturtle", "ht",
              "showturtle", "st", "write", "clear"]:
    setattr(_mod, _name, _delegate(_name))
_mod.bgcolor = _screen.bgcolor
_mod.done = _mod.mainloop = _mod.exitonclick = _mod.tracer = _mod.update = _mod.setup = _mod.title = lambda *args, **kwargs: None
sys.modules["turtle"] = _mod

# input() reads from the "Answers" box, one line per call. Like a terminal, the question and the answer are
# both shown in the output.
_inputs = []

def _kids_set_inputs(text):
    _inputs.clear()
    _inputs.extend(text.splitlines())

def _kids_input(prompt=""):
    sys.stdout.write(str(prompt))
    if not _inputs:
        sys.stdout.write("\\n")
        raise RuntimeError("Your program asked a question with input(), but the Answers box has no more answers. Add another line to the Answers box.")
    answer = _inputs.pop(0)
    sys.stdout.write(answer + "\\n")
    return answer
builtins.input = _kids_input

def _kids_turtle_json():
    return json.dumps({
        "lines": _state["lines"],
        "dots": _state["dots"],
        "bg": _state["bg"],
        "turtles": [[round(t._x, 2), round(t._y, 2), t._h] for t in _turtles],
    })

_kids_reset()
`;
