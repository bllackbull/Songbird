const USER_COLORS = [
  "#10b981",
  "#0ea5e9",
  "#f97316",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f59e0b",
  "#3b82f6",
  "#84cc16",
  "#ec4899",
];

function setUserColor() {
  const index = Math.floor(Math.random() * USER_COLORS.length);
  return USER_COLORS[index];
}

export { USER_COLORS, setUserColor };
