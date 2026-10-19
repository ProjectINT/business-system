// Today in Bali, read per request. A villa is paid by check-in, so whether a missing payment is
// already a debt depends on the day the page is opened; `connection()` keeps the date out of the build.
import { connection } from "next/server";
import { dateIn, type CalendarDate } from "@/lib/calc";
import { TIME_ZONE } from "@/lib/data";

export async function todayInBali(): Promise<CalendarDate> {
  await connection();
  return dateIn(new Date(), TIME_ZONE);
}
