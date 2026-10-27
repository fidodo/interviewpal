import { CourseDefinition } from "./types";

// Blocks for the first four levels (Blockly generates Python behind the scenes), then typed Python.
// `toolbox` lists the Blockly categories a BLOCKS level may use; see client/src/kids/editors/blocks.ts.
export const codingPython: CourseDefinition = {
  slug: "coding-python",
  title: "Coding with Python",
  subject: "Coding",
  description: "Start by snapping blocks together to draw pictures, then write real Python to make games.",
  levels: [
    {
      title: "Give the turtle directions",
      editor: "BLOCKS",
      toolbox: ["turtle"],
      concepts: ["sequences: instructions run one after another, top to bottom", "moving forward and turning left/right by degrees"],
    },
    {
      title: "Repeat after me",
      editor: "BLOCKS",
      toolbox: ["turtle", "loops"],
      concepts: ["repeat loops to avoid writing the same blocks again", "drawing shapes like squares, triangles and stars with loops"],
    },
    {
      title: "Boxes that remember",
      editor: "BLOCKS",
      toolbox: ["turtle", "loops", "math", "variables", "text"],
      concepts: ["variables store a value and can change", "arithmetic with + - * /", "printing words and numbers"],
    },
    {
      title: "Making choices",
      editor: "BLOCKS",
      toolbox: ["turtle", "loops", "math", "variables", "text", "logic"],
      concepts: ["if / else decisions", "comparing numbers with < > ==", "combining loops and decisions"],
    },
    {
      title: "Hello, Python!",
      editor: "PYTHON",
      concepts: ["print() with text and numbers", "strings, joining strings with +, f-strings", "variables in typed code"],
    },
    {
      title: "Loops in Python",
      editor: "PYTHON",
      concepts: ["for loops with range()", "while loops with a stopping condition", "using turtle from typed Python"],
    },
    {
      title: "Decisions and dice",
      editor: "PYTHON",
      concepts: ["if / elif / else", "and, or, not", "the random module: random.randint and random.choice"],
    },
    {
      title: "Your own commands",
      editor: "PYTHON",
      concepts: ["defining functions with def", "parameters and return values", "reusing a function many times"],
    },
    {
      title: "Lists of things",
      editor: "PYTHON",
      concepts: ["lists, indexes and len()", "looping over a list", "append, remove and sorting"],
    },
    {
      title: "Dictionaries",
      editor: "PYTHON",
      concepts: ["key/value pairs in a dictionary", "looking up, adding and updating keys", "looping over a dictionary"],
    },
    {
      title: "Build a mini game",
      editor: "PYTHON",
      concepts: ["combining loops, decisions, functions and lists into a small text game", "keeping score", "simulating player choices without input()"],
    },
    {
      title: "Objects and classes",
      editor: "PYTHON",
      concepts: ["defining a class with __init__", "attributes and methods", "making several objects from one class"],
    },
  ],
};
