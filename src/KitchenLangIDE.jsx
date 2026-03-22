import { useState, useCallback, useEffect, useRef } from "react";

// ─── LEXER ───────────────────────────────────────────────────────────────────
const KEYWORDS = new Set([
  "dish_def", "recipe_mk", "ingredient_def", "tool_use",
  "step_do", "serve_out", "mix", "chop", "fry", "boil",
  "bake", "saute", "blanche", "stir", "toss", "input", "output",
  "blend", "whisk", "grill", "simmer", "knead", "mash", "slice", "dice", "puree", "garnish"
]);
const TECHNIQUES = new Set([
  "mix", "chop", "fry", "boil", "bake", "saute", "blanche", "stir", "toss",
  "blend", "whisk", "grill", "simmer", "knead", "mash", "slice", "dice", "puree", "garnish"
]);

function tokenize(input) {
  const tokens = [], errors = [];
  let i = 0, line = 1, col = 1;
  while (i < input.length) {
    if (/\s/.test(input[i])) {
      let ws = "", sc = col;
      while (i < input.length && /\s/.test(input[i])) {
        ws += input[i];
        if (input[i] === "\n") { line++; col = 1; } else { col++; }
        i++;
      }
      tokens.push({ type: "WHITESPACE", value: ws, line, col: sc }); continue;
    }
    if (input[i] === "#") {
      let cmt = "", sc = col;
      while (i < input.length && input[i] !== "\n") { cmt += input[i]; i++; col++; }
      tokens.push({ type: "COMMENT", value: cmt, line, col: sc }); continue;
    }
    if ("=+".includes(input[i])) { tokens.push({ type: "OPERATOR", value: input[i], line, col }); col++; i++; continue; }
    if ("=".includes(input[i])) { tokens.push({ type: "OPERATOR", value: input[i], line, col }); col++; i++; continue; }
    if ("{}();,".includes(input[i])) { tokens.push({ type: "SYMBOL", value: input[i], line, col }); col++; i++; continue; }
    if (/[0-9]/.test(input[i])) {
      let num = "", sc = col;
      while (i < input.length && /[0-9]/.test(input[i])) { num += input[i]; i++; col++; }
      tokens.push({ type: "NUMBER", value: parseInt(num), line, col: sc }); continue;
    }
    if (input[i] === '"' || input[i] === "'") {
      const q = input[i]; let str = "", sc = col; i++; col++;
      while (i < input.length && input[i] !== q) { str += input[i]; i++; col++; }
      i++; col++;
      tokens.push({ type: "STRING", value: str, line, col: sc }); continue;
    }
    if (/[a-zA-Z_]/.test(input[i])) {
      let word = "", sc = col;
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) { word += input[i]; i++; col++; }
      tokens.push({ type: KEYWORDS.has(word) ? "KEYWORD" : "IDENTIFIER", value: word, line, col: sc }); continue;
    }
    errors.push({ message: `Unexpected character '${input[i]}'`, line, col }); i++; col++;
  }
  tokens.push({ type: "EOF", value: null, line, col });
  return { tokens, errors };
}

// ─── PARSER ──────────────────────────────────────────────────────────────────
class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; this.errors = []; }
  cur() { return this.tokens[this.pos]; }
  consume(type, value) {
    const tok = this.cur();
    if (tok.type === "EOF") { this.errors.push({ message: `Unexpected end of input, expected ${value || type}`, line: tok.line, col: tok.col }); return tok; }
    if (type && tok.type !== type) { this.errors.push({ message: `Expected ${type} but got '${tok.value}'`, line: tok.line, col: tok.col }); return tok; }
    if (value && tok.value !== value) { this.errors.push({ message: `Expected '${value}' but got '${tok.value}'`, line: tok.line, col: tok.col }); return tok; }
    this.pos++; return tok;
  }
  parseKitchen() {
    const node = { type: "Kitchen", children: [] };
    while (this.cur().type !== "EOF") {
      if (this.cur().value === "dish_def") node.children.push(this.parseDish());
      else { this.errors.push({ message: `Unexpected '${this.cur().value}' at top level`, line: this.cur().line }); this.pos++; }
    }
    return node;
  }
  parseDish() {
    const node = { type: "Dish", name: null, recipe: null, serve: null };
    this.consume("KEYWORD", "dish_def");
    node.name = this.consume("IDENTIFIER").value;
    this.consume("SYMBOL", "{");
    if (this.cur().value === "recipe_mk") node.recipe = this.parseRecipe();
    else this.errors.push({ message: "Expected 'recipe_mk' inside dish", line: this.cur().line });
    if (this.cur().value === "serve_out") node.serve = this.parseServe();
    else this.errors.push({ message: "Expected 'serve_out' inside dish", line: this.cur().line });
    this.consume("SYMBOL", "}");
    return node;
  }
  parseRecipe() {
    const node = { type: "Recipe", ingredients: [], tools: [], steps: [], body: [] };
    this.consume("KEYWORD", "recipe_mk");
    this.consume("SYMBOL", "{");
    if (this.cur().value === "ingredient_def") node.ingredients = this.parseIngredients();
    if (this.cur().value === "tool_use") node.tools = this.parseTools();
    while (this.cur().value === "step_do" || this.cur().value === "output") {
      if (this.cur().value === "step_do") {
        const sf = this.parseStep();
        node.steps.push(sf);
        node.body.push(sf);
      } else {
        node.body.push(this.parseOutput());
      }
    }
    this.consume("SYMBOL", "}");
    return node;
  }
  parseIngredients() {
    const list = [];
    this.consume("KEYWORD", "ingredient_def");
    list.push(this.parseIngItem());
    while (this.cur().value === ",") { this.consume("SYMBOL", ","); list.push(this.parseIngItem()); }
    this.consume("SYMBOL", ";");
    return list;
  }
  parseIngItem() {
    const n = this.consume("IDENTIFIER");
    this.consume("OPERATOR", "=");
    if (this.cur().value === "input") {
      this.consume("KEYWORD", "input");
      this.consume("SYMBOL", "(");
      const prompt = this.consume("STRING").value;
      this.consume("SYMBOL", ")");
      return { name: n.value, inputPrompt: prompt, line: n.line };
    }
    const q = this.consume("NUMBER");
    return { name: n.value, quantity: q.value, line: n.line };
  }
  parseTools() {
    const list = [];
    this.consume("KEYWORD", "tool_use");
    const t = this.consume("IDENTIFIER"); list.push({ name: t.value, line: t.line });
    while (this.cur().value === ",") { this.consume("SYMBOL", ","); const t2 = this.consume("IDENTIFIER"); list.push({ name: t2.value, line: t2.line }); }
    this.consume("SYMBOL", ";");
    return list;
  }
  parseOutput() {
    const node = { type: "Output", arg: null, argType: null };
    this.consume("KEYWORD", "output");
    this.consume("SYMBOL", "(");
    const arg = this.cur();
    if (arg.type === "STRING" || arg.type === "IDENTIFIER") {
       node.arg = arg.value; node.argType = arg.type; node.line = arg.line; this.pos++;
    } else { this.errors.push({ message: "Expected string or identifier in output()", line: arg.line }); this.pos++; }
    this.consume("SYMBOL", ")");
    this.consume("SYMBOL", ";");
    return node;
  }
  parseStep() {
    const node = { type: "Step", technique: null, args: [], output: null };
    this.consume("KEYWORD", "step_do");
    
    const tech = this.cur();
    if (TECHNIQUES.has(tech.value)) { node.technique = tech.value; node.line = tech.line; this.pos++; }
    else { this.errors.push({ message: `Unknown technique '${tech.value}'`, line: tech.line }); this.pos++; }
    
    this.consume("SYMBOL", "{");
    
    // Parse left side of assignment (output identifier)
    const outTok = this.cur();
    if (outTok && outTok.type === "IDENTIFIER") {
      node.output = outTok.value;
      this.pos++;
    } else {
      this.errors.push({ message: "Expected identifier for step output", line: this.cur()?.line });
    }

    this.consume("OPERATOR", "=");

    // Parse right side (arguments separated by '+')
    if (this.cur() && this.cur().type === "IDENTIFIER") {
      node.args.push(this.cur().value); this.pos++;
      while (this.cur() && this.cur().value === "+") {
        this.consume("OPERATOR", "+");
        if (this.cur() && this.cur().type === "IDENTIFIER") {
          node.args.push(this.cur().value); this.pos++;
        } else {
          this.errors.push({ message: "Expected identifier after '+'", line: this.cur()?.line });
        }
      }
    } else {
      this.errors.push({ message: "Expected identifier in assignment", line: this.cur()?.line });
    }

    this.consume("SYMBOL", ";");
    this.consume("SYMBOL", "}");
    
    return node;
  }
  parseServe() {
    this.consume("KEYWORD", "serve_out");
    const id = this.consume("IDENTIFIER");
    this.consume("SYMBOL", ";");
    return { type: "Serve", identifier: id.value, line: id.line };
  }
  parse() { return this.parseKitchen(); }
}

// ─── SEMANTIC ANALYZER ───────────────────────────────────────────────────────
const TOOL_REQ = { 
  chop: ["knife", "cutting_board"], fry: ["pan", "stove"], boil: ["pot", "stove"], 
  bake: ["oven"], saute: ["pan", "stove"], blanche: ["pot", "stove"], 
  stir: ["spoon", "pan"], toss: ["bowl"], mix: ["bowl", "spoon"],
  blend: ["blender"], whisk: ["whisk", "bowl"], grill: ["grill"], 
  simmer: ["pot", "stove"], knead: ["cutting_board", "bowl"], mash: ["masher", "bowl"], 
  slice: ["knife", "cutting_board"], dice: ["knife", "cutting_board"], 
  puree: ["blender"], garnish: [] 
};

function semanticAnalysis(ast) {
  const errors = [], warnings = [];
  for (const dish of ast.children) {
    if (dish.type !== "Dish") continue;
    const declaredIng = new Set(), ingNames = new Set(), declaredTools = new Set(), stepOutputs = new Set(), consumedItems = new Set();
    const recipe = dish.recipe;
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      if (ingNames.has(ing.name)) errors.push({ message: `Duplicate ingredient declaration: '${ing.name}'`, line: ing.line });
      else { ingNames.add(ing.name); declaredIng.add(ing.name); }
    }
    for (const tool of recipe.tools) declaredTools.add(tool.name);
    for (const node of recipe.body) {
      if (node.type === "Step") {
        const step = node;
        for (const arg of step.args) {
          if (!declaredIng.has(arg) && !stepOutputs.has(arg))
            errors.push({ message: `Undeclared identifier '${arg}' used in step`, line: step.line });
          else if (consumedItems.has(arg))
            errors.push({ message: `Identifier '${arg}' has already been consumed by a previous step`, line: step.line });
          else
            consumedItems.add(arg);
        }
        if (step.technique && TOOL_REQ[step.technique]) {
          const req = TOOL_REQ[step.technique];
          if (!req.some(r => declaredTools.has(r)))
            warnings.push({ message: `Technique '${step.technique}' may require one of: ${req.join(", ")}`, line: step.line });
        }
        if (stepOutputs.has(step.output)) warnings.push({ message: `Step output '${step.output}' is redefined`, line: step.line });
        stepOutputs.add(step.output);
      } else if (node.type === "Output") {
        if (node.argType === "IDENTIFIER") {
          if (!declaredIng.has(node.arg) && !stepOutputs.has(node.arg)) {
             errors.push({ message: `Undeclared identifier '${node.arg}' used in output`, line: node.line });
          }
        }
      }
    }
    if (dish.serve) {
      const sid = dish.serve.identifier;
      if (!stepOutputs.has(sid) && !declaredIng.has(sid))
        errors.push({ message: `serve_out references '${sid}' which is not a valid step output`, line: dish.serve.line });
    }
    if (recipe.ingredients.length === 0) errors.push({ message: `Dish '${dish.name}' has no ingredients declared` });
    if (recipe.steps.length === 0) errors.push({ message: `Dish '${dish.name}' has no steps declared` });
    if (!dish.serve) errors.push({ message: `Dish '${dish.name}' is missing serve_out statement` });
  }
  return { errors, warnings };
}

// ─── EXECUTION SIMULATOR ─────────────────────────────────────────────────────
function simulate(ast) { return []; } // Replaced by executeVM in React

// ─── DERIVATION ──────────────────────────────────────────────────────────────
function generateDerivation(step) {
  if (!step || !step.technique) return [];
  return [
    { rule: "<kitchen>", arrow: "⇒", expansion: "<dish_def>+" },
    { rule: "<step_do>", arrow: "⇒", expansion: "step_do <technique> { <action_stmt> }" },
    { rule: "<action_stmt>", arrow: "⇒", expansion: "<identifier> = <arg_list> ;" },
    { rule: "<technique>", arrow: "⇒", expansion: step.technique },
    { rule: "<arg_list>", arrow: "⇒", expansion: step.args.join(" + ") || "ε" },
    { rule: "Terminal", arrow: "=", expansion: `step_do ${step.technique} { ${step.output} = ${step.args.join(" + ")}; }` },
  ];
}

// ─── SAMPLE CODE ─────────────────────────────────────────────────────────────
const SAMPLE = `dish_def chicken_adobo {

    recipe_mk {
        
        ingredient_def chicken = 1, soy_sauce = 2, vinegar = 1;
        
        tool_use pan, stove, knife;
        
        step_do chop {
            chopped_chicken = chicken;
        }

        step_do mix {
            marinade = chopped_chicken + soy_sauce + vinegar;
        }

        step_do fry {
            cooked_dish = marinade;
        }
        
    }
    
    serve_out cooked_dish;
}`;

// ─── COLOR MAP ───────────────────────────────────────────────────────────────
const TC = { KEYWORD: "#f59e0b", IDENTIFIER: "#60a5fa", NUMBER: "#34d399", OPERATOR: "#f472b6", SYMBOL: "#a78bfa", STRING: "#fb923c", COMMENT: "#6b7280" };

// ─── PARSE TREE RENDERER ─────────────────────────────────────────────────────
function TreeNode({ label, color, children, last = false }) {
  return (
    <div style={{ paddingLeft: 20, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ color: "#374151", fontSize: 12 }}>{last ? "└──" : "├──"}</span>
        <span style={{ color, fontWeight: 600, fontSize: 13 }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function renderAST(ast) {
  if (!ast || !ast.children) return null;
  return (
    <div>
      <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>⬡ &lt;kitchen&gt;</div>
      {ast.children.map((dish, di) => (
        <div key={di} style={{ paddingLeft: 16 }}>
          <div style={{ color: "#fbbf24", fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
            ├── Dish: <span style={{ color: "#fdba74" }}>{dish.name}</span>
          </div>
          {dish.recipe && (
            <div style={{ paddingLeft: 28 }}>
              <div style={{ color: "#34d399", fontSize: 13, marginBottom: 4 }}>├── Recipe</div>
              <div style={{ paddingLeft: 24 }}>
                {dish.recipe.ingredients.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: "#60a5fa", fontSize: 12, marginBottom: 2 }}>├── Ingredients</div>
                    {dish.recipe.ingredients.map((ing, i, arr) => (
                      <div key={i} style={{ paddingLeft: 24, color: "#93c5fd", fontSize: 12, marginBottom: 2 }}>
                        {i === arr.length - 1 ? "└──" : "├──"} {ing.name} = {ing.quantity}
                      </div>
                    ))}
                  </div>
                )}
                {dish.recipe.tools.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: "#60a5fa", fontSize: 12, marginBottom: 2 }}>├── Tools</div>
                    {dish.recipe.tools.map((t, i, arr) => (
                      <div key={i} style={{ paddingLeft: 24, color: "#93c5fd", fontSize: 12, marginBottom: 2 }}>
                        {i === arr.length - 1 ? "└──" : "├──"} {t.name}
                      </div>
                    ))}
                  </div>
                )}
                {dish.recipe.steps.length > 0 && (
                  <div>
                    <div style={{ color: "#60a5fa", fontSize: 12, marginBottom: 2 }}>└── Steps</div>
                    {dish.recipe.steps.map((step, i, arr) => (
                      <div key={i} style={{ paddingLeft: 24, color: "#c4b5fd", fontSize: 12, marginBottom: 2 }}>
                        {i === arr.length - 1 ? "└──" : "├──"} {step.technique} {'{'} <span style={{ color: "#e879f9" }}>{step.output}</span> = {step.args.join(" + ")} {'}'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {dish.serve && (
            <div style={{ paddingLeft: 28, color: "#a78bfa", fontSize: 13, marginTop: 4 }}>
              └── Serve → <span style={{ color: "#e879f9" }}>{dish.serve.identifier}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function KitchenLangIDE() {
  const [code, setCode] = useState("");
  const [tab, setTab] = useState("tokens");
  const [leftMode, setLeftMode] = useState("code");
  const [result, setResult] = useState(null);
  const [liveErrors, setLiveErrors] = useState({ lex: [], parse: [], sem: [], warnings: [], all: [] });
  const [selectedStep, setSelectedStep] = useState(0);

  // VM mode
  const resolveInput = useRef(null);
  const [vmTerm, setVmTerm] = useState([]);
  const [vmLog, setVmLog] = useState([]);
  const [vmInputWait, setVmInputWait] = useState(false);
  const [vmInputVal, setVmInputVal] = useState("");
  const [bottomTab, setBottomTab] = useState("terminal");

  // Visual mode
  const [vDishes, setVDishes] = useState([{
    id: 1, name: "my_dish", vIng: [{ id: 1, name: "chicken", qty: 1 }, { id: 2, name: "soy_sauce", qty: 2 }], vTools: ["pan", "stove"], vSteps: []
  }]);
  const [dragItem, setDragItem] = useState(null);
  const isVisualEdit = useRef(false);

// --- TUTORIAL STATE ---
  const [tourStep, setTourStep] = useState(-1); // -1 means inactive
  const [tourRect, setTourRect] = useState(null);

  const TUTORIAL_STEPS = [
    { target: "pane-code", title: "1. The Code Editor 📝", content: "Welcome! Here is where you write your KitchenLang recipes. It checks for syntax errors in real-time. Right now, it's totally empty!", showNext: true },
    { target: "btn-sample", title: "2. Action: Load a Sample 📄", content: "Let's get some code in here. Click the 'LOAD SAMPLE' button highlighted above to populate the editor with a complete recipe.", showNext: false },
    { target: "btn-compile", title: "3. Action: Compile! ▶️", content: "Now let's see the compiler in action. Click the 'COMPILE & RUN' button.", showNext: false },
    { target: "pane-tabs", title: "4. Compiler Pipeline 🔍", content: "Success! The compiler generated Tokens, built an Abstract Syntax Tree (AST), and ran Semantic Analysis. Click through these tabs anytime.", showNext: true },
    { target: "pane-bottom", title: "5. Execution Terminal 💻", content: "The Virtual Machine executed your compiled code step-by-step. If you use the input() function, you will type your answers here.", showNext: true },
    { target: "btn-view-toggle", title: "6. Action: Visual Mode 🎨", content: "Coding isn't the only way. Let's switch modes. Click the 'VISUAL' toggle button.", showNext: false },
    { target: "pane-visual", title: "7. The Visual Canvas 🧩", content: "You can drag ingredients, tools, and techniques from the palette on the left directly onto the canvas. The IDE will automatically generate the code for you!", showNext: true }
  ];

  // Update spotlight position when step changes
  useEffect(() => {
    if (tourStep >= 0 && tourStep < TUTORIAL_STEPS.length) {
      // Small timeout ensures the DOM has rendered any tab switches before measuring
      setTimeout(() => {
        const el = document.getElementById(TUTORIAL_STEPS[tourStep].target);
        if (el) {
          setTourRect(el.getBoundingClientRect());
        }
      }, 50);
    } else {
      setTourRect(null);
    }
  }, [tourStep, leftMode, bottomTab]);
  // Background Parser (For live editor underlines and Visual Sync ONLY)
  useEffect(() => {
    try {
      if (isVisualEdit.current && leftMode === "visual") return; // Prevent loop during visual edits
      const { tokens, errors: le } = tokenize(code);
      const parser = new Parser(tokens.filter(t => t.type !== "WHITESPACE" && t.type !== "COMMENT"));
      const ast = parser.parse();
      const pe = parser.errors;
      const { errors: se, warnings } = semanticAnalysis(ast);
      setLiveErrors({ lex: le, parse: pe, sem: se, warnings, all: [...le, ...pe, ...se] });
      
      // Visual sync only updates correctly if syntax tree cleanly builds
      if(le.length===0 && pe.length===0) {
          const newDishes = [];
          for (let i = 0; i < ast.children.length; i++) {
              const dishNode = ast.children[i];
              if (dishNode.type !== "Dish") continue;
              const r = dishNode.recipe;
              newDishes.push({
                 id: Date.now() + "_" + i,
                 name: dishNode.name || `dish_${i+1}`,
                 vIng: r ? r.ingredients.map((ing,idx)=>({id:idx, name:ing.name, qty:ing.quantity})) : [],
                 vTools: r ? r.tools.map(t=>t.name) : [],
                 vSteps: r ? r.steps.map((st,idx)=>({id:idx, technique:st.technique, args:[...st.args], output:st.output})) : [],
                 serve: dishNode.serve ? dishNode.serve.identifier : ""
              });
          }
          if (newDishes.length > 0) setVDishes(newDishes);
      }
    } catch (e) { setLiveErrors({ lex: [], parse: [], sem: [{ message: e.message }], warnings: [], all: [{ message: e.message }] }); }
  }, [code, leftMode]);

  // Live Visual to Code Sync
  useEffect(() => {
    if (leftMode === "visual") {
      isVisualEdit.current = true;
      setCode(genVisualCode());
      setTimeout(() => { isVisualEdit.current = false; }, 50);
    }
  }, [vDishes]);

  const executeVM = async (instructions) => {
    setBottomTab("terminal");
    const log = [];
    const term = [];
    setVmTerm([]);
    setVmLog([]);
    setVmInputWait(false);
    
    const pushTerm = (msg) => { term.push(msg); setVmTerm([...term]); };
    const pushLog = (msg) => { log.push(msg); setVmLog([...log]); };
    const state = {};
   const EMOJI = { 
      mix: "🥄", chop: "🔪", fry: "🍳", boil: "♨️", bake: "🫙", saute: "🍳", 
      blanche: "💧", stir: "🥄", toss: "🥗", blend: "🌪️", whisk: "🥣", 
      grill: "🔥", simmer: "🍲", knead: "🍞", mash: "🥔", slice: "🔪", 
      dice: "🔪", puree: "🥣", garnish: "🌿" 
    };

    for (let i = 0; i < instructions.length; i++) {
        const inst = instructions[i];
        if (inst.type === "DISH_START") {
            pushLog({ action: `🍽️  Starting dish: ${inst.name}` });
        } else if (inst.type === "LOAD_ING") {
            state[inst.name] = { status: "raw", quantity: inst.qty };
            pushLog({ action: `📦 Loaded ingredient: ${inst.name} (qty: ${inst.qty})` });
        } else if (inst.type === "TOOLS") {
            pushLog({ action: `🔧 Tools ready: ${inst.tools.join(", ") || "none"}` });
        } else if (inst.type === "INPUT") {
            pushTerm({ type: "sys", text: inst.prompt });
            setVmInputWait(true);
            const userIn = await new Promise(res => { resolveInput.current = res; });
            setVmInputWait(false);
            pushTerm({ type: "in", text: userIn });
            state[inst.target] = { status: "raw", quantity: userIn };
        } else if (inst.type === "OUTPUT") {
            let val = inst.arg;
            if (inst.argType === "IDENTIFIER") {
                val = state[inst.arg] ? (state[inst.arg].status === "raw" ? state[inst.arg].quantity : state[inst.arg].status) : val;
            }
            pushTerm({ type: "out", text: val });
        } else if (inst.type === "STEP") {
            const step = inst.step;
            const inputStr = step.args.map(a => `${a}(${state[a]?.status || "raw"})`).join(" + ");
            state[step.output] = { status: step.technique + "d", from: step.args };
            pushLog({ action: `${EMOJI[step.technique] || "⚙️"} Step: ${step.technique}(${step.args.join(", ")}) → ${step.output}`, detail: `${inputStr} → ${step.output} [${step.technique}d]` });
        } else if (inst.type === "SERVE") {
            const final = state[inst.identifier];
            pushLog({ action: `✅ SERVE: ${inst.identifier} [${final?.status || "ready"}]`, final: true });
        }
    }
    pushTerm({ type: "sys", text: "\n[Process completed]" });
  };
  const autoFormat = useCallback(() => {
    // We can only format if the code currently compiles into a valid AST
    if (!result || !result.ast || result.parseErrors.length > 0) {
      alert("Cannot format: Please fix syntax errors first.");
      return;
    }

    let formattedCode = "";
    
    // Traverse the AST and rebuild the string with perfect indentation
    result.ast.children.forEach((dish, index) => {
      if (index > 0) formattedCode += "\n\n";
      formattedCode += `dish_def ${dish.name} {\n\n`;
      
      if (dish.recipe) {
        formattedCode += `    recipe_mk {\n        \n`;
        
        // 1. Format Ingredients
        if (dish.recipe.ingredients && dish.recipe.ingredients.length > 0) {
          const ings = dish.recipe.ingredients.map(ing => {
            if (ing.inputPrompt) return `${ing.name} = input("${ing.inputPrompt}")`;
            return `${ing.name} = ${ing.quantity}`;
          }).join(", ");
          formattedCode += `        ingredient_def ${ings};\n        \n`;
        }

        // 2. Format Tools
        if (dish.recipe.tools && dish.recipe.tools.length > 0) {
          const tools = dish.recipe.tools.map(t => t.name).join(", ");
          formattedCode += `        tool_use ${tools};\n        \n`;
        }

        // 3. Format Steps and Outputs in order
        if (dish.recipe.body && dish.recipe.body.length > 0) {
          dish.recipe.body.forEach(node => {
            if (node.type === "Step") {
              formattedCode += `        step_do ${node.technique} {\n`;
              formattedCode += `            ${node.output} = ${node.args.join(" + ")};\n`;
              formattedCode += `        }\n\n`;
            } else if (node.type === "Output") {
              const argStr = node.argType === "STRING" ? `"${node.arg}"` : node.arg;
              formattedCode += `        output(${argStr});\n\n`;
            }
          });
        }

        formattedCode += `    }\n    \n`;
      }

      // 4. Format Serve
      if (dish.serve) {
        formattedCode += `    serve_out ${dish.serve.identifier};\n`;
      }
      
      formattedCode += `}`;
    });

    // Update the editor with the beautiful new code!
    setCode(formattedCode);
  }, [result]);

  // Explicit Compile Button Handler (For Right/Bottom Panels)
  const compile = useCallback(() => {
    try {
      // Auto-advance tutorial if waiting on compile step
      setTourStep(prev => prev === 2 ? 3 : prev);
      const { tokens, errors: le } = tokenize(code);
      const parser = new Parser(tokens.filter(t => t.type !== "WHITESPACE" && t.type !== "COMMENT"));
      const ast = parser.parse();
      const pe = parser.errors;
      const { errors: se, warnings } = semanticAnalysis(ast);
      
      const instructions = [];
      const allSteps = [];
      if (le.length===0 && pe.length===0 && se.length===0 && ast.children) {
         for (const dish of ast.children) {
            if (dish.type !== "Dish" || !dish.recipe) continue;
            allSteps.push(...dish.recipe.steps);
            instructions.push({ type: "DISH_START", name: dish.name });
            for (const ing of dish.recipe.ingredients) {
               if (ing.inputPrompt) instructions.push({ type: "INPUT", prompt: ing.inputPrompt, target: ing.name });
               else instructions.push({ type: "LOAD_ING", name: ing.name, qty: ing.quantity });
            }
            instructions.push({ type: "TOOLS", tools: dish.recipe.tools.map(t=>t.name) });
            for (const node of dish.recipe.body) {
               if (node.type === "Step") instructions.push({ type: "STEP", step: node });
               else if (node.type === "Output") instructions.push({ type: "OUTPUT", arg: node.arg, argType: node.argType });
            }
            if (dish.serve) instructions.push({ type: "SERVE", identifier: dish.serve.identifier });
         }
      }
      
      setResult({ 
         tokens: tokens.filter(t => t.type !== "EOF" && t.type !== "WHITESPACE" && t.type !== "COMMENT"), 
         ast, lexErrors: le, parseErrors: pe, semErrors: se, warnings, allSteps, allErrors: [...le, ...pe, ...se] 
      });

      if (le.length===0 && pe.length===0 && se.length===0) executeVM(instructions);

    } catch (e) { setResult({ tokens: [], ast: null, lexErrors: [], parseErrors: [], semErrors: [{ message: e.message }], warnings: [], allSteps: [], allErrors: [{ message: e.message }] }); }
  }, [code]);

  const RIGHT_TABS = [
    { id: "tokens", label: "Tokens", icon: "🔤" },
    { id: "tree", label: "Parse Tree", icon: "🌲" },
    { id: "semantic", label: "Semantic", icon: "🔍" },
    { id: "derivation", label: "Derivation", icon: "📐" },
  ];

  const genVisualCode = () => {
    let out = "";
    for (const d of vDishes) {
        if(out.length > 0) out += "\n\n";
        const ingLine = d.vIng.length > 0 ? `\n        ingredient_def ${d.vIng.map(i => `${i.name} = ${i.qty}`).join(", ")};` : "";
        const toolLine = d.vTools.length > 0 ? `\n        tool_use ${d.vTools.join(", ")};` : "";
        const stepLines = d.vSteps.map(s => `\n        step_do ${s.technique} {\n            ${s.output} = ${s.args.join(" + ")};\n        }`).join("");
        const serveId = d.serve || (d.vSteps.length > 0 ? d.vSteps[d.vSteps.length - 1].output : "final_dish");
        out += `dish_def ${d.name} {${ingLine ? "\n" : ""}\n    recipe_mk {${ingLine}${toolLine}${stepLines}\n\n    }\n\n    serve_out ${serveId};\n}`;
    }
    return out;
  };

  const errCount = result ? result.allErrors.length : 0;
  const warnCount = result ? result.warnings.length : 0;

  return (
    <div style={{ fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace", background: "#080c14", height: "100vh", color: "#e2e8f0", display: "flex", flexDirection: "column", fontSize: 13, overflow: "hidden" }}>

      {/* TOP BAR */}
      <div style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)", borderBottom: "1px solid #f59e0b33", padding: "10px 20px", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div style={{ fontSize: 26 }}>🍳</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#f59e0b", letterSpacing: "0.08em" }}>KitchenLang IDE</div>
          <div style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.2em" }}>COOKING DSL COMPILER SYSTEM v1.0</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8 }}>
          {result && errCount === 0 && (
            <div style={{ padding: "6px 14px", background: "#064e3b", border: "1px solid #34d399", borderRadius: 6, color: "#34d399", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              ✓ Compiled OK
            </div>
          )}
          {result && errCount > 0 && (
            <div style={{ padding: "6px 14px", background: "#450a0a", border: "1px solid #f87171", borderRadius: 6, color: "#f87171", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              ⚠ {errCount} error{errCount !== 1 ? "s" : ""}
            </div>
          )}
          {result && warnCount > 0 && (
            <div style={{ padding: "6px 14px", background: "#1c1500", border: "1px solid #fbbf24", borderRadius: 6, color: "#fbbf24", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              ⚡ {warnCount} warning{warnCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
        {result && result.ast && result.parseErrors.length===0 && (
          <button onClick={autoFormat} style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",padding:"8px 16px",borderRadius:8,fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:11,letterSpacing:"0.05em",transition:"all 0.2s"}}>
            ✨ Format Code
          </button>
        )}
        <button id="btn-sample" onClick={() => { setCode(SAMPLE); setTourStep(prev => prev === 1 ? 2 : prev); }} style={{ background: "#1e293b", color: "#34d399", border: "1px solid #059669", padding: "8px 16px", borderRadius: 8, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 11, letterSpacing: "0.05em", transition: "all 0.2s" }}>
          📄 LOAD SAMPLE
        </button>
        <button onClick={() => setTourStep(0)} style={{ background: "#1e293b", color: "#60a5fa", border: "1px solid #3b82f6", padding: "8px 16px", borderRadius: 8, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 11, letterSpacing: "0.05em", transition: "all 0.2s" }}>
          🎓 TUTORIAL
        </button>
        <button id="btn-compile" onClick={compile} style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#0f172a", border: "none", padding: "8px 22px", borderRadius: 8, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 12, letterSpacing: "0.1em", boxShadow: "0 0 24px #f59e0b55", transition: "all 0.2s" }}>
          ▶ COMPILE & RUN
        </button>
      </div>

      {/* SPLIT WORKSPACE (LEFT/RIGHT) */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        
        {/* LEFT PANE: EDITOR & REFERENCE */}
        <div style={{ width: "66.666%", minWidth: 400, display: "flex", flexDirection: "column", borderRight: "1px solid #1f2937", background: "#0d1117", overflow: "hidden" }}>
          <div style={{ padding: "8px 16px", background: "#161b22", borderBottom: "1px solid #1f2937", fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.1em", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {leftMode === "code" ? "📝 SOURCE CODE" : "🎨 VISUAL EDITOR"}
            </div>
            <div id="btn-view-toggle" style={{ display: "flex", background: "#080c14", borderRadius: 4, padding: 2 }}>
               <button onClick={() => setLeftMode("code")} style={{ background: leftMode==="code" ? "#f59e0b" : "transparent", color: leftMode==="code" ? "#0f172a" : "#64748b", border: "none", padding: "4px 12px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", zIndex: 20 }}>CODE</button>
               <button onClick={() => { setLeftMode("visual"); setTourStep(prev => prev === 5 ? 6 : prev); }} style={{ background: leftMode==="visual" ? "#a78bfa" : "transparent", color: leftMode==="visual" ? "#0f172a" : "#64748b", border: "none", padding: "4px 12px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", zIndex: 20 }}>VISUAL</button>
            </div>
          </div>
          {leftMode === 'code' && (
          <div id="pane-code" style={{ display: "flex", gap: 16, flex: 1, padding: 20, overflow: "hidden" }}>
            <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 9, color: "#4b5563", letterSpacing: "0.15em" }}>LANGUAGE REFERENCE</div>
              <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 10, padding: 16, flex: 1, overflowY: "auto" }}>
                <Section label="Structure Keywords" color="#f59e0b">
                  {["dish_def", "recipe_mk", "ingredient_def", "tool_use", "step_do", "serve_out"].map(k => <KW key={k} c="#fbbf24">{k}</KW>)}
                </Section>
                <Section label="Techniques" color="#34d399">
                  {Array.from(TECHNIQUES).map(k => <KW key={k} c="#6ee7b7">{k}</KW>)}
                </Section>
                <Section label="Operators" color="#f472b6">
                  {["= (assign)", "+ (combine)", ", (separator)", "; (terminator)"].map(k => <KW key={k} c="#f9a8d4">{k}</KW>)}
                </Section>
                <Section label="Blocks" color="#a78bfa">
                  {["{ } (block)", "( ) (group)"].map(k => <KW key={k} c="#c4b5fd">{k}</KW>)}
                </Section>
                <Section label="Program Template" color="#64748b">
                  <pre style={{ color: "#475569", fontSize: 10, lineHeight: 1.7, margin: 0 }}{...{}}>
                    {`dish_def name {
  recipe_mk {
    ingredient_def
      x = 1;
    tool_use pan;
    step_do chop {
      out = x;
    }
  }
  serve_out out;
}`}
                  </pre>
                </Section>
              </div>
            </div>
<div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 9, color: "#4b5563", marginBottom: 8, letterSpacing: "0.15em" }}>SOURCE CODE — KitchenLang DSL</div>
              <div style={{ flex: 1, display: "flex", background: "#0d1117", border: "1px solid #1f2937", borderRadius: 10, overflow: "hidden", position: "relative" }}>
                <div style={{ background: "#10161f", borderRight: "1px solid #1f2937", padding: "16px 14px", minWidth: 52, textAlign: "right", color: "#2d3748", fontSize: 12, lineHeight: "22px", userSelect: "none", fontVariantNumeric: "tabular-nums", zIndex: 2 }}>
                  {code.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
                </div>
                <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
                  <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, padding: "16px", color: "#c9d1d9", fontSize: 13, lineHeight: "22px", fontFamily: "inherit", whiteSpace: "pre-wrap", wordBreak: "break-all", pointerEvents: "none", overflow: "hidden", zIndex: 1, tabSize: 4 }}>
                    {tokenize(code).tokens.map((t, i) => {
                      if (t.type === "EOF") return null;
                      const errs = liveErrors?.all?.filter(e => e.line === t.line) || [];
                      const warns = liveErrors?.warnings?.filter(w => w.line === t.line) || [];
                      const hasErr = errs.length > 0;
                      const hasWarn = warns.length > 0 && !hasErr;
                      let deco = "none", decoColor = "transparent";
                      if (t.type !== "WHITESPACE" && t.type !== "COMMENT") {
                        if (hasErr) { deco = "underline wavy"; decoColor = "#ef4444"; }
                        else if (hasWarn) { deco = "underline wavy"; decoColor = "#f59e0b"; }
                      }
                      const titleUrl = hasErr ? errs.map(e => e.message).join("\n") : hasWarn ? warns.map(w => w.message).join("\n") : undefined;
                      return (
                        <span key={i} title={titleUrl} style={{
                          color: TC[t.type] || "inherit",
                          textDecoration: deco,
                          textDecorationColor: decoColor,
                          textUnderlineOffset: 3,
                          borderBottom: deco !== "none" ? "none" : "inherit"
                        }}>{t.value}</span>
                      );
                    })}
                  </div>
                  <textarea value={code} onChange={e => setCode(e.target.value)} onScroll={e => { e.target.previousSibling.scrollTop = e.target.scrollTop; e.target.previousSibling.scrollLeft = e.target.scrollLeft; }} spellCheck={false} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "transparent", border: "none", outline: "none", color: "transparent", caretColor: "#e2e8f0", fontSize: 13, lineHeight: "22px", padding: "16px", fontFamily: "inherit", resize: "none", tabSize: 4, zIndex: 2, whiteSpace: "pre-wrap", wordBreak: "break-all" }} />
                </div>
              </div>
            </div>
          </div>
          )}
          {/* ── VISUAL MODE ── */}
        {leftMode === "visual" && (
          <div id="pane-visual" style={{ display: "flex", gap: 16, flex: 1, padding: 20, overflow: "hidden" }}>
            {/* Palette */}
            <div style={{ width: 170, display: "flex", flexDirection: "column", gap: 0, overflowY: "auto" }}>
              <div style={{ fontSize: 9, color: "#4b5563", marginBottom: 10, letterSpacing: "0.15em" }}>DRAG TO CANVAS</div>
              <PaletteSection label="Ingredients 🥘" color="#60a5fa">
                {["chicken", "beef", "pork", "fish", "soy_sauce", "vinegar", "garlic", "onion", "tomato", "potato", "rice", "noodles", "pasta", "salt", "pepper", "oil", "egg", "flour", "butter", "milk", "cheese", "water", "sugar", "lemon"].map(n => (
                  <PaletteItem key={n} color="#60a5fa" onDrag={() => setDragItem({ type: "ingredient", name: n })}>{n}</PaletteItem>
                ))}
              </PaletteSection>
              <PaletteSection label="Tools 🔧" color="#a78bfa">
                {["pan", "stove", "knife", "pot", "oven", "bowl", "spoon", "cutting_board", "wok", "blender", "whisk", "grill", "spatula", "rolling_pin", "masher", "tongs", "peeler", "grater"].map(n => (
                  <PaletteItem key={n} color="#a78bfa" onDrag={() => setDragItem({ type: "tool", name: n })}>{n}</PaletteItem>
                ))}
              </PaletteSection>
              <PaletteSection label="Techniques ⚡" color="#34d399">
                {Array.from(TECHNIQUES).map(n => (
                  <PaletteItem key={n} color="#34d399" onDrag={() => setDragItem({ type: "technique", name: n })}>{n}</PaletteItem>
                ))}
              </PaletteSection>
            </div>

            {/* Canvas */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: "#4b5563", letterSpacing: "0.15em" }}>CANVAS — DROP ITEMS INTO DISHES</div>
                <button onClick={() => setVDishes(p => [...p, { id: Date.now() + Math.random(), name: `new_dish_${p.length+1}`, vIng: [], vTools: [], vSteps: [] }])} style={{ background: "#1f2937", color: "#e2e8f0", border: "none", padding: "4px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>+ ADD DISH</button>
              </div>
              
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
                {vDishes.map((dish, dIndex) => (
                  <div key={dish.id} 
                    onDragOver={e => { e.preventDefault(); }}
                    onDrop={e => {
                      e.preventDefault();
                      if (!dragItem) return;
                      const newDishes = [...vDishes];
                      const d = { ...newDishes[dIndex] };
                      if (dragItem.type === "ingredient") d.vIng = [...d.vIng, { id: Date.now(), name: dragItem.name, qty: 1 }];
                      else if (dragItem.type === "tool") { if(!d.vTools.includes(dragItem.name)) d.vTools = [...d.vTools, dragItem.name]; }
                      else if (dragItem.type === "technique") d.vSteps = [...d.vSteps, { id: Date.now(), technique: dragItem.name, args: [], output: `result_${d.vSteps.length + 1}` }];
                      newDishes[dIndex] = d;
                      setVDishes(newDishes);
                      setDragItem(null);
                    }}
                    style={{ background: "#0d1117", border: "2px dashed #1f2937", borderRadius: 12, padding: 16 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <input value={dish.name} onChange={e => { const nd = [...vDishes]; nd[dIndex] = {...nd[dIndex], name: e.target.value}; setVDishes(nd); }} style={{ background: "transparent", border: "none", borderBottom: "1px solid #374151", color: "#f59e0b", fontSize: 13, fontWeight: "bold", outline: "none", paddingBottom: 2 }} />
                      <button onClick={() => setVDishes(p => p.filter((_, i) => i !== dIndex))} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>✕ Delete</button>
                    </div>

                    {dish.vIng.length === 0 && dish.vTools.length === 0 && dish.vSteps.length === 0 && (
                      <div style={{ textAlign: "center", color: "#374151", padding: "20px 0", fontSize: 12 }}>
                        Drag ingredients, tools & techniques here
                      </div>
                    )}
                    
                    {/* Ingredients */}
                    {dish.vIng.length > 0 && (
                      <CanvasSection label="Ingredients">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {dish.vIng.map(ing => (
                            <div key={ing.id} style={{ background: "#111827", border: "1px solid #3b82f633", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ color: "#60a5fa", fontSize: 12 }}>🥘 {ing.name}</span>
                              <input type="number" value={ing.qty} min={1} onChange={e => { const nd = [...vDishes]; nd[dIndex].vIng = nd[dIndex].vIng.map(x => x.id === ing.id ? { ...x, qty: parseInt(e.target.value) || 1 } : x); setVDishes(nd); }} style={{ width: 38, background: "#0a0f1a", border: "1px solid #1f2937", color: "#34d399", borderRadius: 4, padding: "2px 6px", fontFamily: "inherit", fontSize: 11, textAlign: "center" }} />
                              <span onClick={() => { const nd = [...vDishes]; nd[dIndex].vIng = nd[dIndex].vIng.filter(x => x.id !== ing.id); setVDishes(nd); }} style={{ color: "#374151", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</span>
                            </div>
                          ))}
                        </div>
                      </CanvasSection>
                    )}
                    
                    {/* Tools */}
                    {dish.vTools.length > 0 && (
                      <CanvasSection label="Tools">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {dish.vTools.map(tool => (
                            <div key={tool} style={{ background: "#111827", border: "1px solid #7c3aed33", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ color: "#a78bfa", fontSize: 12 }}>🔧 {tool}</span>
                              <span onClick={() => { const nd = [...vDishes]; nd[dIndex].vTools = nd[dIndex].vTools.filter(t => t !== tool); setVDishes(nd); }} style={{ color: "#374151", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</span>
                            </div>
                          ))}
                        </div>
                      </CanvasSection>
                    )}
                    
                    {/* Steps */}
                    {dish.vSteps.length > 0 && (
                      <CanvasSection label="Steps">
                        {dish.vSteps.map((step, i) => (
                          <div key={step.id} style={{ background: "#111827", border: "1px solid #064e3b", borderRadius: 8, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ color: "#374151", fontSize: 11 }}>step {i + 1}</span>
                            <span style={{ color: "#34d399", fontWeight: 700, fontSize: 13 }}>{step.technique}</span>
                            <span style={{ color: "#4b5563" }}>(</span>
                            <input placeholder="arg1, arg2..." value={step.args.join(", ")} onChange={e => { const nd = [...vDishes]; nd[dIndex].vSteps = nd[dIndex].vSteps.map(s => s.id === step.id ? { ...s, args: e.target.value.split(",").map(a => a.trim()).filter(Boolean) } : s); setVDishes(nd); }} style={{ width: 130, background: "#0a0f1a", border: "1px solid #1f2937", color: "#e2e8f0", borderRadius: 4, padding: "3px 8px", fontFamily: "inherit", fontSize: 11 }} />
                            <span style={{ color: "#4b5563" }}>)</span>
                            <span style={{ color: "#f59e0b", fontWeight: 700 }}>→</span>
                            <input value={step.output} onChange={e => { const nd = [...vDishes]; nd[dIndex].vSteps = nd[dIndex].vSteps.map(s => s.id === step.id ? { ...s, output: e.target.value } : s); setVDishes(nd); }} style={{ width: 110, background: "#0a0f1a", border: "1px solid #1f2937", color: "#e2e8f0", borderRadius: 4, padding: "3px 8px", fontFamily: "inherit", fontSize: 11 }} />
                            <span onClick={() => { const nd = [...vDishes]; nd[dIndex].vSteps = nd[dIndex].vSteps.filter(s => s.id !== step.id); setVDishes(nd); }} style={{ color: "#374151", cursor: "pointer", fontSize: 14, marginLeft: "auto" }}>×</span>
                          </div>
                        ))}
                      </CanvasSection>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => setVDishes([])} style={{ flex: 1, padding: 8, background: "transparent", border: "1px solid #1f2937", borderRadius: 6, color: "#4b5563", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>
                  Clear All Dishes
                </button>
              </div>
            </div>


          </div>
        )}

        </div>

        {/* RIGHT PANE: RESULTS & TOOLS */}
        <div style={{ width: "33.333%", display: "flex", flexDirection: "column", background: "#080c14", overflow: "hidden" }}>
          <div id="pane-tabs" style={{ display: "flex", background: "#0d1117", borderBottom: "1px solid #1f2937", overflowX: "auto", flexShrink: 0 }}>
            {RIGHT_TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 18px", background: tab === t.id ? "#161b22" : "transparent", border: "none", borderBottom: tab === t.id ? "2px solid #f59e0b" : "2px solid transparent", color: tab === t.id ? "#f59e0b" : "#4b5563", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: tab === t.id ? 700 : 400, whiteSpace: "nowrap", letterSpacing: "0.08em", transition: "all 0.15s" }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 20 }}>

        {/* ── TOKENS ── */}
        {tab === "tokens" && (
          <div>
            {!result && <Placeholder />}
            {result && (
              <>
                <SectionHeader>TOKEN STREAM — {result.tokens.length} tokens produced</SectionHeader>
                {/* Legend */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
                  {Object.entries(TC).map(([type, color]) => (
                    <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, background: "#0d1117", border: `1px solid ${color}33`, borderRadius: 20, padding: "3px 10px" }}>
                      <div style={{ width: 8, height: 8, background: color, borderRadius: "50%" }} />
                      <span style={{ color: "#9ca3af", fontSize: 10, letterSpacing: "0.08em" }}>{type}</span>
                      <span style={{ color: "#374151", fontSize: 10 }}>({result.tokens.filter(t => t.type === type).length})</span>
                    </div>
                  ))}
                </div>
                {/* Token chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                  {result.tokens.map((tok, i) => (
                    <div key={i} style={{ background: "#0d1117", border: `1px solid ${(TC[tok.type] || "#374151")}44`, borderRadius: 6, padding: "5px 10px", minWidth: 60 }}>
                      <div style={{ color: TC[tok.type] || "#9ca3af", fontSize: 9, marginBottom: 2, letterSpacing: "0.1em" }}>{tok.type}</div>
                      <div style={{ color: "#e2e8f0", fontSize: 12 }}>{String(tok.value)}</div>
                      <div style={{ color: "#374151", fontSize: 9 }}>L{tok.line}:C{tok.col}</div>
                    </div>
                  ))}
                </div>
                {/* Table */}
                <SectionHeader>TABLE VIEW</SectionHeader>
                <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#161b22" }}>
                        {["#", "Type", "Value", "Line", "Col"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#4b5563", fontWeight: 600, borderBottom: "1px solid #1f2937", letterSpacing: "0.08em" }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {result.tokens.map((tok, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #0f172a", background: i % 2 === 0 ? "#0a0f1a" : "transparent" }}>
                          <td style={{ padding: "7px 14px", color: "#374151" }}>{i + 1}</td>
                          <td style={{ padding: "7px 14px", color: TC[tok.type] || "#9ca3af" }}>{tok.type}</td>
                          <td style={{ padding: "7px 14px", color: "#e2e8f0", fontWeight: 500 }}>{String(tok.value)}</td>
                          <td style={{ padding: "7px 14px", color: "#374151" }}>{tok.line}</td>
                          <td style={{ padding: "7px 14px", color: "#374151" }}>{tok.col}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Lex errors */}
                {result.lexErrors.length > 0 && <Errors errors={result.lexErrors} title="LEXICAL ERRORS" />}
              </>
            )}
          </div>
        )}

        {/* ── PARSE TREE ── */}
        {tab === "tree" && (
          <div>
            {!result && <Placeholder />}
            {result && result.ast && (
              <>
                <SectionHeader>ABSTRACT SYNTAX TREE</SectionHeader>
                <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 10, padding: 24, lineHeight: 1.9, marginBottom: 16 }}>
                  {renderAST(result.ast)}
                </div>
                {result.parseErrors.length > 0 && <Errors errors={result.parseErrors} title="PARSE ERRORS" />}
              </>
            )}
          </div>
        )}

        {/* ── SEMANTIC ── */}
        {tab === "semantic" && (
          <div>
            {!result && <Placeholder />}
            {result && (
              <>
                <SectionHeader>SEMANTIC ANALYSIS REPORT</SectionHeader>
                {/* Status banner */}
                <div style={{ background: errCount === 0 ? "#022c22" : "#1c0505", border: `1px solid ${errCount === 0 ? "#34d399" : "#dc2626"}`, borderRadius: 10, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ fontSize: 32 }}>{errCount === 0 ? "✅" : "❌"}</div>
                  <div>
                    <div style={{ fontWeight: 700, color: errCount === 0 ? "#34d399" : "#f87171", fontSize: 15 }}>{errCount === 0 ? "All semantic checks passed!" : `${errCount} semantic error${errCount !== 1 ? "s" : ""} found`}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{warnCount} warning{warnCount !== 1 ? "s" : ""}  •  {result.allSteps?.length || 0} steps analyzed</div>
                  </div>
                </div>
                {result.allErrors.length > 0 && <Errors errors={result.allErrors} title="ERRORS" />}
                {result.warnings.length > 0 && <Warnings warnings={result.warnings} />}
                {/* Rules checklist */}
                <SectionHeader>SEMANTIC RULES CHECKLIST</SectionHeader>
                <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 10, padding: 20 }}>
                  {[
                    ["Ingredient Declaration", "All ingredients declared before use in steps"],
                    ["Tool Declaration Rule", "All tools must be declared with tool_use"],
                    ["Step Dependency Rule", "Step outputs must exist before being reused"],
                    ["Linear Type Constraint", "Items can only be consumed once in a step"],
                    ["Duplicate Declaration", "No duplicate ingredient names allowed"],
                    ["Type Consistency", "Quantities must be integers, not strings"],
                    ["Final Output Rule", "serve_out must reference a valid step output"],
                    ["Order of Execution", "Steps resolved in logical dependency order"],
                    ["Tool-Technique Compatibility", "Techniques require specific tools"],
                    ["Minimum Structure Rule", "Dish must have recipe, ingredients, steps, serve"],
                  ].map(([rule, desc], i) => (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: i < 8 ? "1px solid #0f172a" : "none" }}>
                      <span style={{ color: "#34d399", fontSize: 14, marginTop: 1 }}>✓</span>
                      <div>
                        <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{rule}</div>
                        <div style={{ color: "#4b5563", fontSize: 11, marginTop: 2 }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── DERIVATION ── */}
        {tab === "derivation" && (
          <div>
            {!result && <Placeholder />}
            {result && (
              <>
                <SectionHeader>GRAMMAR DERIVATION — CFG Rules</SectionHeader>
                {/* CFG */}
                <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 10, padding: 20, marginBottom: 20, fontFamily: "monospace" }}>
                  <div style={{ fontSize: 9, color: "#4b5563", marginBottom: 12, letterSpacing: "0.15em" }}>CONTEXT-FREE GRAMMAR (CFG)</div>
                  {[
                    ["<kitchen>", "::= <dish_def>+"],
                    ["<dish_def>", "::= dish_def <id> { <recipe_mk> <serve_out> }"],
                    ["<recipe_mk>", "::= recipe_mk { <ingredient_def> <tool_use> <stmt_list> }"],
                    ["<ingredient_def>", "::= ingredient_def <ing_list> ;"],
                    ["<ing_item>", "::= <identifier> = <number> | <identifier> = input ( <string> )"],
                    ["<tool_use>", "::= tool_use <tool_list> ;"],
                    ["<stmt_list>", "::= <stmt> | <stmt> <stmt_list>"],
                    ["<stmt>", "::= <step_do> | <output_stmt>"],
                    ["<step_do>", "::= step_do <technique> { <identifier> = <arg_list> ; }"],
                    ["<output_stmt>", "::= output ( <string> | <identifier> ) ;"],
                    ["<serve_out>", "::= serve_out <identifier> ;"],
                  ].map(([lhs, rhs], i) => (
                    <div key={i} style={{ display: "flex", gap: 16, marginBottom: 7, alignItems: "baseline" }}>
                      <span style={{ color: "#a78bfa", minWidth: 160, fontSize: 12 }}>{lhs}</span>
                      <span style={{ color: "#374151", fontSize: 12 }}>{rhs}</span>
                    </div>
                  ))}
                </div>

                {result.allSteps.length > 0 ? (
                  <>
                    <div style={{ fontSize: 9, color: "#4b5563", marginBottom: 10, letterSpacing: "0.15em" }}>SELECT STEP FOR DERIVATION</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                      {result.allSteps.map((s, i) => (
                        <button key={i} onClick={() => setSelectedStep(i)} style={{ padding: "6px 14px", background: selectedStep === i ? "#1e1b4b" : "#0d1117", border: `1px solid ${selectedStep === i ? "#a78bfa" : "#1f2937"}`, borderRadius: 6, color: selectedStep === i ? "#a78bfa" : "#4b5563", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: selectedStep === i ? 700 : 400, letterSpacing: "0.05em" }}>
                          step {i + 1}: {s.technique}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 9, color: "#4b5563", marginBottom: 12, letterSpacing: "0.15em" }}>
                      STEP-BY-STEP DERIVATION FOR: step_do {result.allSteps[selectedStep]?.technique}(...)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {generateDerivation(result.allSteps[selectedStep]).map((d, i, arr) => (
                        <div key={i}>
                          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: i === arr.length - 1 ? "#022c22" : "#0d1117", border: `1px solid ${i === arr.length - 1 ? "#34d399" : "#1f2937"}`, borderRadius: i === 0 ? "10px 10px 0 0" : i === arr.length - 1 ? "0 0 10px 10px" : "0" }}>
                            <div style={{ minWidth: 30, textAlign: "center", color: "#374151", fontSize: 11, fontWeight: 700 }}>
                              {i === arr.length - 1 ? "✓" : i + 1}
                            </div>
                            <div style={{ flex: 1 }}>
                              {i < arr.length - 1 ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                  <span style={{ color: "#a78bfa", fontSize: 12 }}>{d.rule}</span>
                                  <span style={{ color: "#f59e0b", fontSize: 14 }}>{d.arrow}</span>
                                  <span style={{ color: "#e2e8f0", fontSize: 12 }}>{d.expansion}</span>
                                </div>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ color: "#34d399", fontSize: 12, fontWeight: 700 }}>Terminal String:</span>
                                  <span style={{ color: "#fbbf24", fontSize: 12 }}>{d.expansion}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {i < arr.length - 1 && (
                            <div style={{ textAlign: "center", color: "#374151", padding: "2px 0", fontSize: 18 }}>⬇</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ color: "#374151", textAlign: "center", padding: 40 }}>No steps found. Run the compiler first.</div>
                )}
              </>
            )}
          </div>
        )}

                  </div>
        </div>
      </div>

      {/* BOTTOM PANE: TERMINAL / EXECUTION */}
      <div id="pane-bottom" style={{ height: "30vh", minHeight: 250, borderTop: "1px solid #1f2937", background: "#05080f", display: "flex", flexDirection: "column", zIndex: 10 }}>
        <div style={{ padding: "0 8px", background: "#0a0f1a", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", gap: 0 }}>
          <button onClick={() => setBottomTab("terminal")} style={{ padding: "10px 18px", background: bottomTab === "terminal" ? "#161b22" : "transparent", border: "none", borderBottom: bottomTab === "terminal" ? "2px solid #34d399" : "2px solid transparent", color: bottomTab === "terminal" ? "#34d399" : "#64748b", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: bottomTab === "terminal" ? 700 : 400, letterSpacing: "0.08em", transition: "all 0.15s" }}>▶ TERMINAL</button>
          <button onClick={() => setBottomTab("log")} style={{ padding: "10px 18px", background: bottomTab === "log" ? "#161b22" : "transparent", border: "none", borderBottom: bottomTab === "log" ? "2px solid #f59e0b" : "2px solid transparent", color: bottomTab === "log" ? "#f59e0b" : "#64748b", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: bottomTab === "log" ? 700 : 400, letterSpacing: "0.08em", transition: "all 0.15s" }}>⚙ EXECUTION LOG</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column" }}>
          {bottomTab === "terminal" && (
            <div style={{ flex: 1, fontFamily: "monospace", display: "flex", flexDirection: "column", gap: 6 }}>
              {vmTerm.map((l, i) => (
                 <div key={i} style={{ color: l.type === "in" ? "#34d399" : l.type==="sys" ? "#94a3b8" : "#e2e8f0" }}>
                   {l.type === "out" ? "" : (l.type === "in" ? "> " : "")}
                   {l.text}
                 </div>
              ))}
              {vmInputWait && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ color: "#34d399" }}>&gt;</span>
                  <input 
                     autoFocus
                     value={vmInputVal}
                     onChange={e => setVmInputVal(e.target.value)}
                     onKeyDown={e => {
                        if (e.key === "Enter") {
                           const v = vmInputVal;
                           setVmInputVal("");
                           if (resolveInput.current) resolveInput.current(v);
                        }
                     }}
                     style={{ background: "transparent", border: "none", outline: "none", color: "#34d399", fontSize: 13, fontFamily: "monospace", flex: 1 }}
                  />
                </div>
              )}
              {result && result.allErrors.length > 0 && <Errors errors={result.allErrors} title="COMPILATION FAILED: CHECK EXECUTION LOG" />}
            </div>
          )}

          {bottomTab === "log" && (
            <div>
              {!result && <div style={{ color: "#4b5563" }}>Ready. Click 'COMPILE & RUN' to execute.</div>}
              {result && result.allErrors.length > 0 && <Errors errors={result.allErrors} title="COMPILATION ERRORS" />}
              {result && result.warnings.length > 0 && <Warnings warnings={result.warnings} />}
              {result && result.allErrors.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                   {vmLog.map((step, i) => (
                     <div key={i} style={{ display: "flex", gap: 14, padding: "8px 12px", background: step.final ? "#022c22" : "#0d1117", border: `1px solid ${step.final ? "#34d399" : "#1f2937"}`, borderRadius: 8, alignItems: "flex-start" }}>
                       <div style={{ background: "#0a0f1a", color: "#374151", padding: "2px 8px", borderRadius: 4, fontSize: 10, minWidth: 28, textAlign: "center", marginTop: 2, border: "1px solid #1f2937", fontWeight: 600 }}>{i + 1}</div>
                       <div style={{ flex: 1 }}>
                         <div style={{ color: step.final ? "#34d399" : "#e2e8f0", fontSize: 13, marginBottom: step.detail ? 4 : 0, fontWeight: step.final ? 700 : 400 }}>{step.action}</div>
                         {step.detail && <div style={{ color: "#4b5563", fontSize: 11, marginTop: 2 }}>{step.detail}</div>}
                       </div>
                       {step.final && <div style={{ color: "#34d399", fontSize: 16 }}>🍽</div>}
                     </div>
                   ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* --- TUTORIAL OVERLAY --- */}
      {tourStep >= 0 && tourStep < TUTORIAL_STEPS.length && tourRect && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: "none" }}>
          
          {/* Dark overlay with clear cutout - SET TO POINTER-EVENTS NONE SO CLICKS PASS THROUGH */}
          <div style={{
            position: "absolute",
            top: tourRect.top - 8,
            left: tourRect.left - 8,
            width: tourRect.width + 16,
            height: tourRect.height + 16,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.75)",
            border: "2px solid #60a5fa",
            borderRadius: 8,
            transition: "all 0.3s ease",
            pointerEvents: "none", 
            zIndex: 10000
          }} />
          
          {/* Tooltip Card */}
          <div style={{
            position: "absolute",
            top: tourRect.bottom > window.innerHeight - 200 ? tourRect.top - 160 : tourRect.bottom + 20,
            left: Math.max(20, Math.min(tourRect.left, window.innerWidth - 340)),
            width: 320,
            background: "#1e293b",
            border: "1px solid #3b82f6",
            borderRadius: 12,
            padding: 20,
            color: "#e2e8f0",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.8)",
            transition: "all 0.3s ease",
            pointerEvents: "auto",
            zIndex: 10001
          }}>
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>
              STEP {tourStep + 1} OF {TUTORIAL_STEPS.length}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#60a5fa", marginBottom: 10 }}>
              {TUTORIAL_STEPS[tourStep].title}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "#cbd5e1", marginBottom: 20 }}>
              {TUTORIAL_STEPS[tourStep].content}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={() => setTourStep(-1)} style={{ background: "transparent", color: "#94a3b8", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                End Tour
              </button>
              
              {/* Conditional Next Button / Action Prompt */}
              {TUTORIAL_STEPS[tourStep].showNext ? (
                <button onClick={() => setTourStep(tourStep === TUTORIAL_STEPS.length - 1 ? -1 : tourStep + 1)} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "6px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                  {tourStep === TUTORIAL_STEPS.length - 1 ? "Finish" : "Next ➔"}
                </button>
              ) : (
                <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, padding: "6px 12px", background: "#f59e0b22", borderRadius: 6, border: "1px dashed #f59e0b" }}>
                  Follow instructions to continue
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HELPER COMPONENTS ───────────────────────────────────────────────────────
function Section({ label, color, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, color, letterSpacing: "0.15em", marginBottom: 6, fontWeight: 700 }}>{label}</div>
      {children}
    </div>
  );
}
function KW({ c, children }) {
  return <div style={{ color: c, fontSize: 11, marginBottom: 3, paddingLeft: 8 }}>{children}</div>;
}
function SectionHeader({ children, style = {} }) {
  return <div style={{ fontSize: 9, color: "#4b5563", marginBottom: 12, letterSpacing: "0.15em", marginTop: 20, ...style }}>{children}</div>;
}
function Placeholder() {
  return (
    <div style={{ textAlign: "center", paddingTop: 80, color: "#1f2937", fontSize: 14 }}>
      Click <span style={{ color: "#f59e0b", fontWeight: 700 }}>▶ COMPILE &amp; RUN</span> to analyze your code.
    </div>
  );
}
function Errors({ errors, title = "ERRORS" }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 9, color: "#dc2626", marginBottom: 8, letterSpacing: "0.15em" }}>{title}</div>
      {errors.map((e, i) => (
        <div key={i} style={{ background: "#1c0505", border: "1px solid #7f1d1d", borderRadius: 6, padding: "8px 14px", marginBottom: 6, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color: "#f87171", fontSize: 12 }}>✗</span>
          <div>
            <span style={{ color: "#fca5a5", fontSize: 12 }}>{e.message}</span>
            {e.line && <span style={{ color: "#4b5563", fontSize: 10, marginLeft: 8 }}>line {e.line}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
function Warnings({ warnings }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 9, color: "#d97706", marginBottom: 8, letterSpacing: "0.15em" }}>WARNINGS</div>
      {warnings.map((w, i) => (
        <div key={i} style={{ background: "#1c1500", border: "1px solid #78350f", borderRadius: 6, padding: "8px 14px", marginBottom: 6, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color: "#fbbf24", fontSize: 12 }}>⚠</span>
          <div>
            <span style={{ color: "#fcd34d", fontSize: 12 }}>{w.message}</span>
            {w.line && <span style={{ color: "#4b5563", fontSize: 10, marginLeft: 8 }}>line {w.line}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
function PaletteSection({ label, color, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, color, letterSpacing: "0.12em", marginBottom: 6, fontWeight: 700 }}>{label}</div>
      {children}
    </div>
  );
}
function PaletteItem({ color, onDrag, children }) {
  return (
    <div draggable onDragStart={onDrag} style={{ background: "#0d1117", border: `1px solid ${color}22`, borderRadius: 6, padding: "5px 10px", marginBottom: 4, fontSize: 11, cursor: "grab", color, userSelect: "none", transition: "all 0.15s" }}>
      {children}
    </div>
  );
}
function CanvasSection({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, color: "#374151", letterSpacing: "0.15em", marginBottom: 8, borderBottom: "1px solid #111827", paddingBottom: 6 }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}
