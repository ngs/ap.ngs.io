export function formatDates() {
  document.querySelectorAll('time[datetime]').forEach((el) => {
    const datetime = el.getAttribute('datetime');
    if (datetime) {
      const date = new Date(datetime);
      el.textContent = date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  });
}
