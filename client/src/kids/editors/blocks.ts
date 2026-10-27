import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as En from "blockly/msg/en";
import { Order, pythonGenerator } from "blockly/python";

// Custom turtle blocks plus the built-in loop/maths/variable/text/logic blocks, grouped into the toolbox
// categories a level can unlock (CourseLevel.toolbox in server/prisma/curriculum).

Blockly.setLocale(En as unknown as Record<string, string>);

const TURTLE_COLOUR = "#0f766e";
const COLOURS: [string, string][] = [
  ["black", "black"],
  ["red", "red"],
  ["orange", "orange"],
  ["yellow", "gold"],
  ["green", "green"],
  ["blue", "blue"],
  ["purple", "purple"],
  ["pink", "hotpink"],
  ["brown", "saddlebrown"],
];

function valueBlock(type: string, message: string, tooltip: string) {
  return {
    type,
    message0: message,
    args0: [{ type: "input_value", name: "VALUE", check: "Number" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: TURTLE_COLOUR,
    tooltip,
  };
}

function plainBlock(type: string, message: string, tooltip: string) {
  return { type, message0: message, previousStatement: null, nextStatement: null, colour: TURTLE_COLOUR, tooltip };
}

Blockly.common.defineBlocksWithJsonArray([
  valueBlock("turtle_forward", "move forward %1", "Move the turtle forward this many steps"),
  valueBlock("turtle_backward", "move backward %1", "Move the turtle backward this many steps"),
  valueBlock("turtle_left", "turn left %1 degrees", "Turn the turtle to its left"),
  valueBlock("turtle_right", "turn right %1 degrees", "Turn the turtle to its right"),
  plainBlock("turtle_penup", "pen up (stop drawing)", "Lift the pen so moving doesn't draw"),
  plainBlock("turtle_pendown", "pen down (start drawing)", "Put the pen down so moving draws a line"),
  {
    type: "turtle_color",
    message0: "set pen colour to %1",
    args0: [{ type: "field_dropdown", name: "COLOUR", options: COLOURS }],
    previousStatement: null,
    nextStatement: null,
    colour: TURTLE_COLOUR,
    tooltip: "Change the colour of the lines",
  },
  valueBlock("turtle_pensize", "set pen size to %1", "Make the lines thicker or thinner"),
  valueBlock("turtle_circle", "draw a circle with radius %1", "Draw a circle to the turtle's left"),
]);

const call = (fn: string) => (block: Blockly.Block) => {
  const value = pythonGenerator.valueToCode(block, "VALUE", Order.NONE) || "0";
  return `turtle.${fn}(${value})\n`;
};

pythonGenerator.forBlock["turtle_forward"] = call("forward");
pythonGenerator.forBlock["turtle_backward"] = call("backward");
pythonGenerator.forBlock["turtle_left"] = call("left");
pythonGenerator.forBlock["turtle_right"] = call("right");
pythonGenerator.forBlock["turtle_pensize"] = call("pensize");
pythonGenerator.forBlock["turtle_circle"] = call("circle");
pythonGenerator.forBlock["turtle_penup"] = () => "turtle.penup()\n";
pythonGenerator.forBlock["turtle_pendown"] = () => "turtle.pendown()\n";
pythonGenerator.forBlock["turtle_color"] = (block) => `turtle.pencolor("${block.getFieldValue("COLOUR")}")\n`;

const num = (n: number) => ({ shadow: { type: "math_number", fields: { NUM: n } } });

const CATEGORIES: Record<string, Blockly.utils.toolbox.ToolboxItemInfo> = {
  turtle: {
    kind: "category",
    name: "Turtle",
    colour: TURTLE_COLOUR,
    contents: [
      { kind: "block", type: "turtle_forward", inputs: { VALUE: num(100) } },
      { kind: "block", type: "turtle_backward", inputs: { VALUE: num(50) } },
      { kind: "block", type: "turtle_left", inputs: { VALUE: num(90) } },
      { kind: "block", type: "turtle_right", inputs: { VALUE: num(90) } },
      { kind: "block", type: "turtle_color" },
      { kind: "block", type: "turtle_pensize", inputs: { VALUE: num(4) } },
      { kind: "block", type: "turtle_circle", inputs: { VALUE: num(50) } },
      { kind: "block", type: "turtle_penup" },
      { kind: "block", type: "turtle_pendown" },
    ],
  },
  loops: {
    kind: "category",
    name: "Loops",
    categorystyle: "loop_category",
    contents: [{ kind: "block", type: "controls_repeat_ext", inputs: { TIMES: num(4) } }],
  },
  math: {
    kind: "category",
    name: "Numbers",
    categorystyle: "math_category",
    contents: [
      { kind: "block", type: "math_number", fields: { NUM: 10 } },
      { kind: "block", type: "math_arithmetic", inputs: { A: num(1), B: num(1) } },
      { kind: "block", type: "math_random_int", inputs: { FROM: num(1), TO: num(10) } },
    ],
  },
  variables: { kind: "category", name: "Variables", categorystyle: "variable_category", custom: "VARIABLE" },
  text: {
    kind: "category",
    name: "Words",
    categorystyle: "text_category",
    contents: [
      { kind: "block", type: "text_print", inputs: { TEXT: { shadow: { type: "text", fields: { TEXT: "Hello!" } } } } },
      { kind: "block", type: "text" },
      { kind: "block", type: "text_join" },
    ],
  },
  logic: {
    kind: "category",
    name: "Decisions",
    categorystyle: "logic_category",
    contents: [
      { kind: "block", type: "controls_if" },
      { kind: "block", type: "controls_if", extraState: { hasElse: true } },
      { kind: "block", type: "logic_compare" },
      { kind: "block", type: "logic_operation" },
      { kind: "block", type: "logic_boolean" },
    ],
  },
};

export function buildToolbox(categories: string[]): Blockly.utils.toolbox.ToolboxDefinition {
  const allowed = categories.length ? categories : ["turtle"];
  return { kind: "categoryToolbox", contents: allowed.map((c) => CATEGORIES[c]).filter(Boolean) };
}

export function workspaceToPython(workspace: Blockly.Workspace): string {
  const code = pythonGenerator.workspaceToCode(workspace).trim();
  return code.includes("turtle.") ? `import turtle\n\n${code}\n` : code ? `${code}\n` : "";
}

export { Blockly };
