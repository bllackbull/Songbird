export function buildTimestampSchedule(count, daysBack) {
  const safeCountRaw = Number(count);
  const safeDaysRaw = Number(daysBack);
  const safeCount = Number.isFinite(safeCountRaw)
    ? Math.max(1, Math.min(10000, Math.trunc(safeCountRaw)))
    : 1;
  const days = Number.isFinite(safeDaysRaw)
    ? Math.max(1, Math.min(365, Math.trunc(safeDaysRaw)))
    : 1;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nowSecondsOfDay =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const startDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const stamps = [];

  startDay.setDate(startDay.getDate() - (days - 1));

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const baseCount = Math.floor(safeCount / days);
    const remainder = safeCount % days;
    const messagesInDay = baseCount + (dayIndex < remainder ? 1 : 0);
    if (!messagesInDay) continue;

    const dayStart = new Date(startDay);
    dayStart.setDate(startDay.getDate() + dayIndex);

    const isToday =
      dayStart.getFullYear() === today.getFullYear() &&
      dayStart.getMonth() === today.getMonth() &&
      dayStart.getDate() === today.getDate();
    const maxSecondOfDay = isToday
      ? Math.max(0, Math.min(86399, nowSecondsOfDay))
      : 86399;
    const seconds = [];

    for (let i = 0; i < messagesInDay; i += 1) {
      seconds.push(Math.floor(Math.random() * (maxSecondOfDay + 1)));
    }

    seconds.sort((a, b) => a - b);

    for (let i = 0; i < seconds.length; i += 1) {
      stamps.push(
        new Date(dayStart.getTime() + seconds[i] * 1000).toISOString(),
      );
    }
  }

  return stamps;
}
