// Placeholder data for the layout stage. Magnitudes come from a naive pass over
// the CSVs (no pro-rata, no DQ engine); replace with the finance engine output.

export type Kpi = {
  id: string;
  label: string;
  value: number;
  hint: string;
  tag?: { label: string; color: "default" | "accent" | "success" | "warning" | "danger" };
};

export const KPIS: Kpi[] = [
  {
    id: "gross",
    label: "Gross bookings",
    value: 1_252_752_856,
    hint: "134 active reservations · 681 nights",
  },
  { id: "ota", label: "OTA fees", value: 183_108_072, hint: "14.6% of gross bookings" },
  {
    id: "mgmt",
    label: "Management fees",
    value: 222_630_407,
    hint: "17–20% of gross, per commission rules",
  },
  { id: "opex", label: "Operating expenses", value: 49_462_041, hint: "Paid + pending, 89 lines" },
  {
    id: "owner",
    label: "Owner balance",
    value: 797_552_336,
    hint: "Net rental − mgmt fees − expenses",
    tag: { label: "Estimate", color: "warning" },
  },
  {
    id: "cash",
    label: "Cash received",
    value: 511_162_604,
    hint: "IDR 558.5M below expected net rental",
    tag: { label: "Cash basis", color: "accent" },
  },
];

export type WeekPoint = { week: string; accrued: number; received: number };

// Net rental accrued (gross − OTA fee) vs cash received, by week.
export const ACCRUED_VS_RECEIVED: WeekPoint[] = [
  { week: "Aug 31", accrued: 196_929_796, received: 11_696_621 },
  { week: "Sep 7", accrued: 163_583_544, received: 119_502_652 },
  { week: "Sep 14", accrued: 108_576_059, received: 73_751_320 },
  { week: "Sep 21", accrued: 120_809_224, received: 41_297_971 },
  { week: "Sep 28", accrued: 137_443_913, received: 72_777_106 },
  { week: "Oct 5", accrued: 118_724_818, received: 35_364_734 },
  { week: "Oct 12", accrued: 94_784_378, received: 46_710_396 },
  { week: "Oct 19", accrued: 100_925_250, received: 84_939_577 },
  { week: "Oct 26", accrued: 39_179_867, received: 37_343_612 },
  { week: "Nov 2", accrued: 0, received: 12_717_060 },
];

export type RecordStatus = "clean" | "review" | "excluded" | "duplicate";

export const STATUS_META: Record<
  RecordStatus,
  { label: string; color: "success" | "warning" | "danger" | "default"; description: string }
> = {
  clean: { label: "Clean", color: "success", description: "No issues, used in calculations" },
  review: { label: "Review", color: "warning", description: "Used, flagged for a human check" },
  excluded: { label: "Excluded", color: "danger", description: "Not used, shown as unallocated" },
  duplicate: { label: "Duplicate", color: "default", description: "Exact copy, removed on import" },
};

export const DATA_QUALITY = {
  totalRows: 357,
  byStatus: { clean: 235, review: 112, excluded: 8, duplicate: 2 } satisfies Record<
    RecordStatus,
    number
  >,
  lastBatch: { id: "B-002", at: "2026-10-15 09:12" },
};

export type PropertyAggregate = {
  id: string;
  name: string;
  cluster: string;
  reservations: number;
  nights: number;
  gross: number;
  ota: number;
  mgmt: number;
  expenses: number;
  ownerBalance: number;
  received: number;
  flags: number;
};

export const PROPERTY_AGGREGATES: PropertyAggregate[] = [
  { id: "V001", name: "Villa 01", cluster: "Ubud", reservations: 5, nights: 32, gross: 47_247_793, ota: 7_663_224, mgmt: 8_032_126, expenses: 3_234_693, ownerBalance: 28_317_750, received: 24_281_163, flags: 3 },
  { id: "V002", name: "Villa 02", cluster: "Canggu", reservations: 7, nights: 40, gross: 81_758_451, ota: 12_305_726, mgmt: 13_898_938, expenses: 714_562, ownerBalance: 54_839_225, received: 19_167_083, flags: 5 },
  { id: "V003", name: "Villa 03", cluster: "Sanur", reservations: 13, nights: 67, gross: 137_704_067, ota: 19_874_881, mgmt: 23_409_693, expenses: 2_596_831, ownerBalance: 91_822_662, received: 26_904_936, flags: 11 },
  { id: "V004", name: "Villa 04", cluster: "Bukit", reservations: 6, nights: 28, gross: 51_234_890, ota: 7_323_206, mgmt: 10_246_978, expenses: 4_063_945, ownerBalance: 29_600_761, received: 32_855_004, flags: 4 },
  { id: "V005", name: "Villa 05", cluster: "Ubud", reservations: 7, nights: 42, gross: 65_419_762, ota: 9_917_791, mgmt: 11_121_360, expenses: 2_691_120, ownerBalance: 41_689_491, received: 35_924_647, flags: 6 },
  { id: "V006", name: "Villa 06", cluster: "Canggu", reservations: 4, nights: 18, gross: 34_793_056, ota: 5_459_494, mgmt: 5_914_820, expenses: 2_616_146, ownerBalance: 20_802_596, received: 26_844_763, flags: 1 },
  { id: "V007", name: "Villa 07", cluster: "Sanur", reservations: 2, nights: 12, gross: 21_130_753, ota: 2_746_383, mgmt: 3_592_228, expenses: 2_539_519, ownerBalance: 12_252_623, received: 12_414_755, flags: 0 },
  { id: "V008", name: "Villa 08", cluster: "Bukit", reservations: 12, nights: 61, gross: 102_096_188, ota: 14_411_447, mgmt: 20_419_238, expenses: 3_040_740, ownerBalance: 64_224_763, received: 29_105_859, flags: 14 },
  { id: "V009", name: "Villa 09", cluster: "Ubud", reservations: 7, nights: 34, gross: 71_783_035, ota: 11_228_329, mgmt: 12_203_117, expenses: 2_050_877, ownerBalance: 46_300_712, received: 48_739_568, flags: 6 },
  { id: "V010", name: "Villa 10", cluster: "Canggu", reservations: 9, nights: 35, gross: 61_713_721, ota: 9_918_192, mgmt: 10_491_332, expenses: 1_668_860, ownerBalance: 39_635_337, received: 11_923_166, flags: 7 },
  { id: "V011", name: "Villa 11", cluster: "Sanur", reservations: 4, nights: 15, gross: 26_791_884, ota: 3_603_816, mgmt: 4_554_620, expenses: 1_616_472, ownerBalance: 17_016_976, received: 10_302_481, flags: 0 },
  { id: "V012", name: "Villa 12", cluster: "Bukit", reservations: 2, nights: 15, gross: 19_370_666, ota: 2_600_450, mgmt: 3_874_134, expenses: 3_680_031, ownerBalance: 9_216_051, received: 7_819_170, flags: 1 },
  { id: "V013", name: "Villa 13", cluster: "Ubud", reservations: 9, nights: 48, gross: 80_786_015, ota: 11_800_415, mgmt: 13_733_622, expenses: 4_245_896, ownerBalance: 51_006_082, received: 33_452_668, flags: 8 },
  { id: "V014", name: "Villa 14", cluster: "Canggu", reservations: 5, nights: 24, gross: 51_618_314, ota: 7_572_969, mgmt: 8_775_114, expenses: 1_221_334, ownerBalance: 34_048_897, received: 19_772_321, flags: 3 },
  { id: "V015", name: "Villa 15", cluster: "Sanur", reservations: 5, nights: 29, gross: 44_878_447, ota: 6_403_558, mgmt: 7_629_336, expenses: 3_054_771, ownerBalance: 27_790_782, received: 8_565_368, flags: 4 },
  { id: "V016", name: "Villa 16", cluster: "Bukit", reservations: 9, nights: 53, gross: 68_589_685, ota: 9_715_100, mgmt: 13_717_937, expenses: 1_137_124, ownerBalance: 44_019_524, received: 55_783_955, flags: 7 },
  { id: "V017", name: "Villa 17", cluster: "Ubud", reservations: 8, nights: 40, gross: 80_206_215, ota: 11_322_122, mgmt: 13_635_057, expenses: 2_048_613, ownerBalance: 53_200_423, received: 35_421_867, flags: 6 },
  { id: "V018", name: "Villa 18", cluster: "Canggu", reservations: 4, nights: 19, gross: 46_175_896, ota: 6_218_518, mgmt: 7_849_902, expenses: 1_804_165, ownerBalance: 30_303_311, received: 9_256_372, flags: 2 },
  { id: "V019", name: "Villa 19", cluster: "Sanur", reservations: 7, nights: 32, gross: 78_665_007, ota: 10_977_491, mgmt: 13_373_052, expenses: 2_531_913, ownerBalance: 51_782_551, received: 20_358_791, flags: 5 },
  { id: "V020", name: "Villa 20", cluster: "Bukit", reservations: 9, nights: 37, gross: 80_789_011, ota: 12_044_960, mgmt: 16_157_803, expenses: 2_904_429, ownerBalance: 49_681_819, received: 42_268_667, flags: 9 },
];

export const PERIODS = [
  { id: "all", label: "Sep 1 – Nov 5, 2026" },
  { id: "2026-09", label: "September 2026" },
  { id: "2026-10", label: "October 2026" },
];

export const CLUSTERS = ["Ubud", "Canggu", "Sanur", "Bukit"];
