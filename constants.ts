import { Era, Chapter } from './types';

export const CHAPTERS: Chapter[] = [
  {
    id: Era.Introduction,
    title: "The Observation Deck",
    description: "Welcome to my laboratory, my dear friend. Let us gaze into the history of thought.",
    prompt: "You are Professor Albert Einstein. Address the user as 'My dear friend'. Introduce the 'Einstein's Universe' experience. Explain that we will journey through several pivotal eras of math. Keep it whimsical, humble, and academic. End by asking if they are ready to explore the Foundations of ancient tally marks and Egyptian geometry. Generate a [IMAGE: A friendly chalkboard sketch of Professor Einstein with his signature wild hair and a warm, inquisitive smile]."
  },
  {
    id: Era.Foundations,
    title: "The Foundations",
    description: "Ancient tally marks and Egyptian geometry.",
    prompt: "Discuss the Foundations of math: Ancient tally marks and Egyptian geometry. Use metaphors. Include a LaTeX equation like $A = \\frac{1}{2}bh$ for a triangle. Generate a [IMAGE: A chalkboard sketch of ancient Egyptian pyramids and measuring ropes] tag."
  },
  {
    id: Era.Geometry,
    title: "The Geometry of Forms",
    description: "Euclidean axioms and the perfection of symmetry.",
    prompt: "Discuss the beauty of Geometry. Mention Euclid's Elements and the five axioms. How do shapes define our reality? Include the Pythagorean theorem $a^2 + b^2 = c^2$. Generate a [IMAGE: A chalkboard sketch of perfect geometric shapes—circles, triangles, and squares—interlocking in a symmetrical pattern]."
  },
  {
    id: Era.Zero,
    title: "The Origins of Zero",
    description: "Indian mathematics and the concept of the void.",
    prompt: "Explain the concept of Zero from Indian mathematics. Why is the 'void' so powerful? Use a metaphor about an empty pocket. Include the notation for zero in ancient Brahmi numerals if possible. Generate a [IMAGE: A chalkboard sketch of a vast cosmic void centered around a circular zero symbol]."
  },
  {
    id: Era.Algebra,
    title: "The Birth of Algebra",
    description: "Al-Khwarizmi and the art of balancing equations.",
    prompt: "Discuss Al-Khwarizmi and 'Al-Jabr'. Explain the beauty of balancing scales. Show an equation like $ax^2 + bx + c = 0$. Generate a [IMAGE: A chalkboard sketch of golden scales balancing letters and numbers]."
  },
  {
    id: Era.Calculus,
    title: "The Calculus Revolution",
    description: "Newton, Leibniz, and the study of change.",
    prompt: "Discuss Calculus, the study of change. Mention the falling apple and the flux of the stars. Include $\\frac{dy}{dx}$ and $\\int$. Generate a [IMAGE: A chalkboard sketch of a planet moving along a tangent line of a curve]."
  },
  {
    id: Era.Analysis,
    title: "The Age of Analysis",
    description: "Euler’s beauty and non-Euclidean curves.",
    prompt: "Discuss Euler and non-Euclidean curves. Mention $e^{i\\pi} + 1 = 0$ as the most beautiful equation. Explain that space itself might be curved. Generate a [IMAGE: A chalkboard sketch of a complex mathematical manifold or a curved grid of space]."
  },
  {
    id: Era.Quantum,
    title: "The Quantum Leap",
    description: "Uncertainty, probability, and Planck’s constant.",
    prompt: "Discuss the Quantum realm. Mention that God does not play dice (or does He?). Mention $\\Delta x \\Delta p \\geq \\frac{\\hbar}{2}$. Generate a [IMAGE: A chalkboard sketch of a fuzzy atom with overlapping probability clouds]."
  },
  {
    id: Era.Unified,
    title: "The Unified Theory",
    description: "The search for a 'Theory of Everything'.",
    prompt: "Discuss the search for the Unified Theory. How do we bridge the big and the small? $R_{\\mu\\nu} - \\frac{1}{2}Rg_{\\mu\\nu} = \\frac{8\\pi G}{c^4}T_{\\mu\\nu}$. Generate a [IMAGE: A chalkboard sketch of a grand tapestry weaving together stars and subatomic particles]."
  }
];