export function formatDate(
  val: any,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }
): string {
  if (!val) return "N/A";

  let date: Date;

  if (typeof val?.toDate === "function") {
    date = val.toDate();
  } else if (val instanceof Date) {
    date = val;
  } else if (typeof val === "object" && typeof val.seconds === "number") {
    date = new Date(val.seconds * 1000);
  } else {
    date = new Date(val);
  }

  if (isNaN(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleDateString("en-US", options);
}
