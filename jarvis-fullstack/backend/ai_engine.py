"""JARVIS offline AI engine.

A rule-based, fully offline assistant tuned to answer common school questions
across math, science, history, geography, and English, plus general
conversation. No external API or model download required.

The single public entry point is ``generate_response(message)``.
"""
import re
import ast
import math
import random
import operator

# --------------------------------------------------------------------------- #
# Small talk
# --------------------------------------------------------------------------- #
GREETINGS = [
    "Hello. JARVIS online and at your service. What can I help you with?",
    "Good to see you. How can I assist today?",
    "JARVIS here. Ready when you are.",
]
HOW_ARE_YOU = [
    "All systems nominal and running at full capacity. How can I help?",
    "Operating perfectly, thank you for asking. What's on your mind?",
]
THANKS = [
    "Always a pleasure. Anything else?",
    "Happy to help. What's next?",
]
JOKES = [
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "There are 10 kinds of people: those who understand binary and those who don't.",
    "A SQL query walks into a bar, approaches two tables and asks: may I join you?",
    "Why did the math book look sad? It had too many problems.",
]

# --------------------------------------------------------------------------- #
# School knowledge base
#   Each entry: a list of trigger keywords -> an answer string.
#   The first entry whose ALL-or-ANY keywords match wins (see _kb_lookup).
# --------------------------------------------------------------------------- #
KNOWLEDGE = [
    # ---- Mathematics ----
    (["pythagoras", "pythagorean"],
     "The Pythagorean theorem: in a right triangle, a² + b² = c², where c is "
     "the hypotenuse (the side opposite the right angle). Example: if a = 3 and "
     "b = 4, then c = √(9 + 16) = √25 = 5."),
    (["area", "circle"],
     "Area of a circle = π × r², where r is the radius. Its circumference is "
     "2 × π × r. For r = 7: area ≈ 3.14159 × 49 ≈ 153.94 square units."),
    (["area", "triangle"],
     "Area of a triangle = ½ × base × height. For example, base 10 and height 6 "
     "gives ½ × 10 × 6 = 30 square units."),
    (["area", "rectangle"],
     "Area of a rectangle = length × width. Its perimeter = 2 × (length + width)."),
    (["quadratic"],
     "The quadratic formula solves ax² + bx + c = 0:\n\n"
     "    x = (−b ± √(b² − 4ac)) / (2a)\n\n"
     "The part under the root, b² − 4ac, is the discriminant — it tells you how "
     "many real solutions there are (positive = two, zero = one, negative = none)."),
    (["prime number", "prime numbers", "what is a prime"],
     "A prime number is a whole number greater than 1 whose only factors are 1 "
     "and itself. The first primes are 2, 3, 5, 7, 11, 13, 17, 19, 23, 29. "
     "Note: 2 is the only even prime."),
    (["percentage", "percent"],
     "To find a percentage: (part ÷ whole) × 100. To take X% of a number, "
     "multiply by X/100. Example: 20% of 150 = 150 × 0.20 = 30."),
    (["fraction"],
     "A fraction shows a part of a whole, written as numerator/denominator. "
     "To add fractions, give them a common denominator first; to multiply, "
     "multiply tops and bottoms: a/b × c/d = (a×c)/(b×d)."),
    (["multiplication table", "times table"],
     "A times table lists the products of a number. For example, the 3× table: "
     "3, 6, 9, 12, 15, 18, 21, 24, 27, 30. Tell me which number's table you want."),

    # ---- Physics / Science ----
    (["newton", "laws of motion", "law of motion"],
     "Newton's three laws of motion:\n\n"
     "1. An object stays at rest or in uniform motion unless acted on by a force "
     "(inertia).\n"
     "2. Force = mass × acceleration (F = ma).\n"
     "3. Every action has an equal and opposite reaction."),
    (["speed of light"],
     "The speed of light in a vacuum is about 299,792,458 metres per second "
     "(roughly 3 × 10⁸ m/s). Nothing with mass can reach it."),
    (["gravity"],
     "Gravity is the force that attracts objects with mass toward each other. "
     "On Earth, it accelerates falling objects at about 9.8 m/s². It's why things "
     "fall and why planets orbit the Sun."),
    (["photosynthesis"],
     "Photosynthesis is how green plants make food. Using sunlight, they convert "
     "carbon dioxide and water into glucose and oxygen:\n\n"
     "    6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂\n\n"
     "It happens in the chloroplasts, which contain chlorophyll."),
    (["water cycle"],
     "The water cycle moves water around Earth in stages: evaporation (water "
     "turns to vapour), condensation (vapour forms clouds), precipitation (rain "
     "or snow falls), and collection (water gathers in oceans, lakes, rivers) — "
     "then it repeats."),
    (["states of matter"],
     "The main states of matter are solid (fixed shape and volume), liquid "
     "(fixed volume, takes the shape of its container), and gas (fills its "
     "container). Plasma is a fourth state found in stars."),
    (["periodic table"],
     "The periodic table arranges all chemical elements by atomic number "
     "(number of protons). Rows are 'periods' and columns are 'groups' — "
     "elements in the same group behave similarly. Hydrogen (H) is element 1."),
    (["cell", "cells", "what is a cell"],
     "A cell is the basic unit of life. Plant and animal cells share a nucleus, "
     "cytoplasm, and membrane; plant cells also have a cell wall and "
     "chloroplasts. All living things are made of one or more cells."),
    (["solar system", "planets"],
     "Our solar system has eight planets orbiting the Sun, in order: Mercury, "
     "Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune. The first four "
     "are rocky; the last four are gas/ice giants."),

    # ---- Geography ----
    (["continents", "how many continents"],
     "There are seven continents: Africa, Antarctica, Asia, Europe, North "
     "America, Oceania (Australia), and South America. Asia is the largest."),
    (["capital of france"],
     "The capital of France is Paris."),
    (["capital of ghana"],
     "The capital of Ghana is Accra."),
    (["capital of nigeria"],
     "The capital of Nigeria is Abuja (Lagos is the largest city)."),
    (["longest river"],
     "The Nile and the Amazon are the two longest rivers; the Nile in Africa is "
     "usually cited as the longest at about 6,650 km."),
    (["largest ocean"],
     "The Pacific Ocean is the largest and deepest ocean on Earth."),
    (["highest mountain", "tallest mountain"],
     "Mount Everest is the highest mountain above sea level, about 8,849 metres."),

    # ---- History ----
    (["world war 2", "world war two", "wwii", "ww2"],
     "World War II ran from 1939 to 1945, fought between the Allies (including "
     "Britain, the USA, the USSR) and the Axis (Germany, Italy, Japan). It ended "
     "in 1945 after Germany surrendered in May and Japan in September."),
    (["world war 1", "world war one", "wwi", "ww1"],
     "World War I lasted from 1914 to 1918, triggered by the assassination of "
     "Archduke Franz Ferdinand. It was fought mainly in Europe between the "
     "Allied and Central Powers."),
    (["industrial revolution"],
     "The Industrial Revolution (roughly 1760–1840) was the shift from hand "
     "production to machines and factories, beginning in Britain. It transformed "
     "manufacturing, transport, and society."),

    # ---- English / grammar ----
    (["noun"],
     "A noun is a word that names a person, place, thing, or idea — like "
     "'teacher', 'city', 'book', or 'freedom'."),
    (["verb"],
     "A verb is an action or state-of-being word — like 'run', 'think', 'is', "
     "or 'become'. Every complete sentence needs one."),
    (["adjective"],
     "An adjective describes or modifies a noun — like 'tall', 'blue', or "
     "'happy' in 'a happy child'."),
    (["adverb"],
     "An adverb modifies a verb, adjective, or another adverb, often telling how, "
     "when, or where — like 'quickly', 'very', or 'yesterday'. Many end in -ly."),
    (["synonym"],
     "A synonym is a word with the same or similar meaning as another — e.g. "
     "'happy' and 'joyful'. An antonym is the opposite, like 'hot' and 'cold'."),
    (["metaphor"],
     "A metaphor describes something by saying it IS something else, without "
     "'like' or 'as' — e.g. 'Time is a thief'. A simile uses 'like' or 'as'."),
]


# --------------------------------------------------------------------------- #
# Safe arithmetic evaluation (so "what is 12 * 8 + 5" actually computes)
# --------------------------------------------------------------------------- #
_ALLOWED_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
    ast.FloorDiv: operator.floordiv,
}


def _safe_eval(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_OPS:
        return _ALLOWED_OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_OPS:
        return _ALLOWED_OPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError("unsupported expression")


def _try_math(message: str):
    """Detect and evaluate a plain arithmetic expression. Returns str or None."""
    # Normalise common words/symbols to operators
    expr = message.lower()
    expr = re.sub(r"\bwhat\s+is\b|\bcalculate\b|\bcompute\b|\bsolve\b|=|\?", " ", expr)
    expr = expr.replace("plus", "+").replace("minus", "-")
    expr = expr.replace("times", "*").replace("multiplied by", "*").replace("x", "*")
    expr = expr.replace("divided by", "/").replace("over", "/")
    expr = expr.replace("^", "**")
    # Keep only math-safe characters
    if not re.search(r"\d", expr):
        return None
    cleaned = re.sub(r"[^0-9+\-*/().% ]", "", expr).strip()
    if not cleaned or not re.search(r"[+\-*/%]", cleaned):
        return None
    try:
        tree = ast.parse(cleaned, mode="eval")
        result = _safe_eval(tree.body)
        if isinstance(result, float) and result.is_integer():
            result = int(result)
        elif isinstance(result, float):
            result = round(result, 6)
        return f"{cleaned.strip()} = {result}"
    except Exception:
        return None


def _kb_lookup(message: str):
    """Return the best knowledge-base answer, or None.

    Each entry's keyword list is a set of ALTERNATIVE triggers (OR). A trigger
    may itself be a multi-word phrase, which must appear in full. The entry
    with the longest matching trigger wins, so specific phrases beat generic
    single words.
    """
    m = message.lower()
    best = None
    best_score = 0
    for triggers, answer in KNOWLEDGE:
        for trigger in triggers:
            if trigger in m and len(trigger) > best_score:
                best, best_score = answer, len(trigger)
    return best


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #
def generate_response(message: str) -> str:
    m = (message or "").strip()
    if not m:
        return "I'm listening — go ahead and type your question."

    low = m.lower()

    # 1. Small talk first (cheap, high-confidence)
    if low in ("hi", "hey", "hello") or any(
        w in low for w in ("hello", "hey there", "greetings")
    ):
        return random.choice(GREETINGS)
    if "how are you" in low:
        return random.choice(HOW_ARE_YOU)
    if "thank" in low:
        return random.choice(THANKS)
    if "joke" in low:
        return random.choice(JOKES)
    if "your name" in low or "who are you" in low:
        return (
            "I'm JARVIS — Just A Rather Very Intelligent System — your personal "
            "AI study assistant. Ask me about math, science, history, geography, "
            "or English, and I'll help."
        )
    if any(w in low for w in ("what can you do", "help me", "what do you know")):
        return (
            "I can help with school subjects: mathematics (I can even do "
            "calculations), science, history, geography, and English grammar — "
            "plus general questions and coding. Try asking things like "
            "'What is photosynthesis?', 'What is 12 × 8 + 5?', or "
            "'Explain Newton's laws'."
        )

    # 2. Live arithmetic
    math_result = _try_math(m)
    if math_result:
        return f"Here's the calculation:\n\n    {math_result}"

    # 3. Knowledge base (school topics)
    kb = _kb_lookup(m)
    if kb:
        return kb

    # 4. Coding help
    if any(w in low for w in ("code", "function", "bug", "python",
                              "javascript", "react", "program")):
        if "python" in low:
            return (
                "Here's a clean Python example:\n\n"
                "```python\n"
                "def greet(name: str) -> str:\n"
                "    return f\"Hello, {name}!\"\n\n"
                'print(greet("World"))\n'
                "```\n\n"
                "Tell me what it should do and I'll tailor it."
            )
        return (
            "Happy to help with code. Tell me the language and the exact goal — "
            "inputs, expected output, and any constraints."
        )

    # 5. General question fallback
    if low.endswith("?") or low.startswith(
        ("what", "why", "how", "when", "who", "where", "explain", "define")
    ):
        return (
            f"Here's how I'd approach \"{m}\":\n\n"
            "Start with the core definition, then the key parts, then a concrete "
            "example. If you tell me the subject (math, science, history, "
            "geography, or English), I can give a more precise answer — I'm "
            "tuned for school topics."
        )

    return (
        f"You said: \"{m}\". I can explain it, calculate it, or expand on it. "
        "I'm especially good with school subjects — try a math, science, "
        "history, geography, or English question."
    )
