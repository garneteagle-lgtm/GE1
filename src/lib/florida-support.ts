/**
 * Florida child support and alimony estimators.
 *
 * Child support: Florida Statutes § 61.30 (Income Shares model). The guidelines
 * schedule in subsection (6) is reproduced below verbatim ($800–$10,000 of
 * combined monthly net income, in $50 steps, columns for 1–6 children). For
 * combined income above $10,000 the statutory marginal percentages apply.
 *
 * Alimony: Florida Statutes § 61.08 as amended by SB 1416 (effective July 1,
 * 2023): no permanent alimony; durational length capped by marriage length;
 * amount capped at the lesser of the obligee's reasonable need or 35% of the
 * difference between the parties' net incomes.
 *
 * These are ESTIMATES for case-planning only — not legal advice, and a court
 * may deviate. Figures should always be checked against the current statute.
 */

// § 61.30(6) guidelines schedule. Each row: [combined monthly net income,
// 1 child, 2, 3, 4, 5, 6 children].
const SCHEDULE: ReadonlyArray<readonly [number, number, number, number, number, number, number]> = [
  [800, 190, 211, 213, 216, 218, 220],
  [850, 202, 257, 259, 262, 265, 268],
  [900, 213, 302, 305, 309, 312, 315],
  [950, 224, 347, 351, 355, 359, 363],
  [1000, 235, 365, 397, 402, 406, 410],
  [1050, 246, 382, 443, 448, 453, 458],
  [1100, 258, 400, 489, 495, 500, 505],
  [1150, 269, 417, 522, 541, 547, 553],
  [1200, 280, 435, 544, 588, 594, 600],
  [1250, 290, 451, 565, 634, 641, 648],
  [1300, 300, 467, 584, 659, 688, 695],
  [1350, 310, 482, 603, 681, 735, 743],
  [1400, 320, 498, 623, 702, 765, 790],
  [1450, 330, 513, 642, 724, 789, 838],
  [1500, 340, 529, 662, 746, 813, 869],
  [1550, 350, 544, 681, 768, 836, 895],
  [1600, 360, 560, 701, 790, 860, 920],
  [1650, 370, 575, 720, 812, 884, 945],
  [1700, 380, 591, 740, 833, 907, 971],
  [1750, 390, 606, 759, 855, 931, 996],
  [1800, 400, 622, 779, 877, 955, 1022],
  [1850, 410, 638, 798, 900, 979, 1048],
  [1900, 421, 654, 818, 923, 1004, 1074],
  [1950, 431, 670, 839, 946, 1029, 1101],
  [2000, 442, 686, 859, 968, 1054, 1128],
  [2050, 452, 702, 879, 991, 1079, 1154],
  [2100, 463, 718, 899, 1014, 1104, 1181],
  [2150, 473, 734, 919, 1037, 1129, 1207],
  [2200, 484, 751, 940, 1060, 1154, 1234],
  [2250, 494, 767, 960, 1082, 1179, 1261],
  [2300, 505, 783, 980, 1105, 1204, 1287],
  [2350, 515, 799, 1000, 1128, 1229, 1314],
  [2400, 526, 815, 1020, 1151, 1254, 1340],
  [2450, 536, 831, 1041, 1174, 1279, 1367],
  [2500, 547, 847, 1061, 1196, 1304, 1394],
  [2550, 557, 864, 1081, 1219, 1329, 1420],
  [2600, 568, 880, 1101, 1242, 1354, 1447],
  [2650, 578, 896, 1121, 1265, 1379, 1473],
  [2700, 588, 912, 1141, 1287, 1403, 1500],
  [2750, 597, 927, 1160, 1308, 1426, 1524],
  [2800, 607, 941, 1178, 1328, 1448, 1549],
  [2850, 616, 956, 1197, 1349, 1471, 1573],
  [2900, 626, 971, 1215, 1370, 1494, 1598],
  [2950, 635, 986, 1234, 1391, 1517, 1622],
  [3000, 644, 1001, 1252, 1412, 1540, 1647],
  [3050, 654, 1016, 1271, 1433, 1563, 1671],
  [3100, 663, 1031, 1289, 1453, 1586, 1695],
  [3150, 673, 1045, 1308, 1474, 1608, 1720],
  [3200, 682, 1060, 1327, 1495, 1631, 1744],
  [3250, 691, 1075, 1345, 1516, 1654, 1769],
  [3300, 701, 1090, 1364, 1537, 1677, 1793],
  [3350, 710, 1105, 1382, 1558, 1700, 1818],
  [3400, 720, 1120, 1401, 1579, 1723, 1842],
  [3450, 729, 1135, 1419, 1599, 1745, 1867],
  [3500, 738, 1149, 1438, 1620, 1768, 1891],
  [3550, 748, 1164, 1456, 1641, 1791, 1915],
  [3600, 757, 1179, 1475, 1662, 1814, 1940],
  [3650, 767, 1194, 1493, 1683, 1837, 1964],
  [3700, 776, 1208, 1503, 1702, 1857, 1987],
  [3750, 784, 1221, 1520, 1721, 1878, 2009],
  [3800, 793, 1234, 1536, 1740, 1899, 2031],
  [3850, 802, 1248, 1553, 1759, 1920, 2053],
  [3900, 811, 1261, 1570, 1778, 1940, 2075],
  [3950, 819, 1275, 1587, 1797, 1961, 2097],
  [4000, 828, 1288, 1603, 1816, 1982, 2119],
  [4050, 837, 1302, 1620, 1835, 2002, 2141],
  [4100, 846, 1315, 1637, 1854, 2023, 2163],
  [4150, 854, 1329, 1654, 1873, 2044, 2185],
  [4200, 863, 1342, 1670, 1892, 2064, 2207],
  [4250, 872, 1355, 1687, 1911, 2085, 2229],
  [4300, 881, 1369, 1704, 1930, 2106, 2251],
  [4350, 889, 1382, 1721, 1949, 2127, 2273],
  [4400, 898, 1396, 1737, 1968, 2147, 2295],
  [4450, 907, 1409, 1754, 1987, 2168, 2317],
  [4500, 916, 1423, 1771, 2006, 2189, 2339],
  [4550, 924, 1436, 1788, 2024, 2209, 2361],
  [4600, 933, 1450, 1804, 2043, 2230, 2384],
  [4650, 942, 1463, 1821, 2062, 2251, 2406],
  [4700, 951, 1477, 1838, 2081, 2271, 2428],
  [4750, 959, 1490, 1855, 2100, 2292, 2450],
  [4800, 968, 1503, 1871, 2119, 2313, 2472],
  [4850, 977, 1517, 1888, 2138, 2334, 2494],
  [4900, 986, 1530, 1905, 2157, 2354, 2516],
  [4950, 993, 1542, 1927, 2174, 2372, 2535],
  [5000, 1000, 1551, 1939, 2188, 2387, 2551],
  [5050, 1006, 1561, 1952, 2202, 2402, 2567],
  [5100, 1013, 1571, 1964, 2215, 2417, 2583],
  [5150, 1019, 1580, 1976, 2229, 2432, 2599],
  [5200, 1025, 1590, 1988, 2243, 2447, 2615],
  [5250, 1032, 1599, 2000, 2256, 2462, 2631],
  [5300, 1038, 1609, 2012, 2270, 2477, 2647],
  [5350, 1045, 1619, 2024, 2283, 2492, 2663],
  [5400, 1051, 1628, 2037, 2297, 2507, 2679],
  [5450, 1057, 1638, 2049, 2311, 2522, 2695],
  [5500, 1064, 1647, 2061, 2324, 2537, 2711],
  [5550, 1070, 1657, 2073, 2338, 2552, 2727],
  [5600, 1077, 1667, 2085, 2352, 2567, 2743],
  [5650, 1083, 1676, 2097, 2365, 2582, 2759],
  [5700, 1089, 1686, 2109, 2379, 2597, 2775],
  [5750, 1096, 1695, 2122, 2393, 2612, 2791],
  [5800, 1102, 1705, 2134, 2406, 2627, 2807],
  [5850, 1107, 1713, 2144, 2418, 2639, 2820],
  [5900, 1111, 1721, 2155, 2429, 2651, 2833],
  [5950, 1116, 1729, 2165, 2440, 2663, 2847],
  [6000, 1121, 1737, 2175, 2451, 2676, 2860],
  [6050, 1126, 1746, 2185, 2462, 2688, 2874],
  [6100, 1131, 1754, 2196, 2473, 2700, 2887],
  [6150, 1136, 1762, 2206, 2484, 2712, 2900],
  [6200, 1141, 1770, 2216, 2495, 2724, 2914],
  [6250, 1145, 1778, 2227, 2506, 2737, 2927],
  [6300, 1150, 1786, 2237, 2517, 2749, 2941],
  [6350, 1155, 1795, 2247, 2529, 2761, 2954],
  [6400, 1160, 1803, 2258, 2540, 2773, 2967],
  [6450, 1165, 1811, 2268, 2551, 2785, 2981],
  [6500, 1170, 1819, 2278, 2562, 2798, 2994],
  [6550, 1175, 1827, 2288, 2573, 2810, 3008],
  [6600, 1179, 1835, 2299, 2584, 2822, 3021],
  [6650, 1184, 1843, 2309, 2595, 2834, 3034],
  [6700, 1189, 1850, 2317, 2604, 2845, 3045],
  [6750, 1193, 1856, 2325, 2613, 2854, 3055],
  [6800, 1196, 1862, 2332, 2621, 2863, 3064],
  [6850, 1200, 1868, 2340, 2630, 2872, 3074],
  [6900, 1204, 1873, 2347, 2639, 2882, 3084],
  [6950, 1208, 1879, 2355, 2647, 2891, 3094],
  [7000, 1212, 1885, 2362, 2656, 2900, 3103],
  [7050, 1216, 1891, 2370, 2664, 2909, 3113],
  [7100, 1220, 1897, 2378, 2673, 2919, 3123],
  [7150, 1224, 1903, 2385, 2681, 2928, 3133],
  [7200, 1228, 1909, 2393, 2690, 2937, 3142],
  [7250, 1232, 1915, 2400, 2698, 2946, 3152],
  [7300, 1235, 1921, 2408, 2707, 2956, 3162],
  [7350, 1239, 1927, 2415, 2716, 2965, 3172],
  [7400, 1243, 1933, 2423, 2724, 2974, 3181],
  [7450, 1247, 1939, 2430, 2733, 2983, 3191],
  [7500, 1251, 1945, 2438, 2741, 2993, 3201],
  [7550, 1255, 1951, 2446, 2750, 3002, 3211],
  [7600, 1259, 1957, 2453, 2758, 3011, 3220],
  [7650, 1263, 1963, 2461, 2767, 3020, 3230],
  [7700, 1267, 1969, 2468, 2775, 3030, 3240],
  [7750, 1271, 1975, 2476, 2784, 3039, 3250],
  [7800, 1274, 1981, 2483, 2792, 3048, 3259],
  [7850, 1278, 1987, 2491, 2801, 3057, 3269],
  [7900, 1282, 1992, 2498, 2810, 3067, 3279],
  [7950, 1286, 1998, 2506, 2818, 3076, 3289],
  [8000, 1290, 2004, 2513, 2827, 3085, 3298],
  [8050, 1294, 2010, 2521, 2835, 3094, 3308],
  [8100, 1298, 2016, 2529, 2844, 3104, 3318],
  [8150, 1302, 2022, 2536, 2852, 3113, 3328],
  [8200, 1306, 2028, 2544, 2861, 3122, 3337],
  [8250, 1310, 2034, 2551, 2869, 3131, 3347],
  [8300, 1313, 2040, 2559, 2878, 3141, 3357],
  [8350, 1317, 2046, 2566, 2887, 3150, 3367],
  [8400, 1321, 2052, 2574, 2895, 3159, 3376],
  [8450, 1325, 2058, 2581, 2904, 3168, 3386],
  [8500, 1329, 2064, 2589, 2912, 3178, 3396],
  [8550, 1333, 2070, 2597, 2921, 3187, 3406],
  [8600, 1337, 2076, 2604, 2929, 3196, 3415],
  [8650, 1341, 2082, 2612, 2938, 3205, 3425],
  [8700, 1345, 2088, 2619, 2946, 3215, 3435],
  [8750, 1349, 2094, 2627, 2955, 3224, 3445],
  [8800, 1352, 2100, 2634, 2963, 3233, 3454],
  [8850, 1356, 2106, 2642, 2972, 3242, 3464],
  [8900, 1360, 2111, 2649, 2981, 3252, 3474],
  [8950, 1364, 2117, 2657, 2989, 3261, 3484],
  [9000, 1368, 2123, 2664, 2998, 3270, 3493],
  [9050, 1372, 2129, 2672, 3006, 3279, 3503],
  [9100, 1376, 2135, 2680, 3015, 3289, 3513],
  [9150, 1380, 2141, 2687, 3023, 3298, 3523],
  [9200, 1384, 2147, 2695, 3032, 3307, 3532],
  [9250, 1388, 2153, 2702, 3040, 3316, 3542],
  [9300, 1391, 2159, 2710, 3049, 3326, 3552],
  [9350, 1395, 2165, 2717, 3058, 3335, 3562],
  [9400, 1399, 2171, 2725, 3066, 3344, 3571],
  [9450, 1403, 2177, 2732, 3075, 3353, 3581],
  [9500, 1407, 2183, 2740, 3083, 3363, 3591],
  [9550, 1411, 2189, 2748, 3092, 3372, 3601],
  [9600, 1415, 2195, 2755, 3100, 3381, 3610],
  [9650, 1419, 2201, 2763, 3109, 3390, 3620],
  [9700, 1422, 2206, 2767, 3115, 3396, 3628],
  [9750, 1425, 2210, 2772, 3121, 3402, 3634],
  [9800, 1427, 2213, 2776, 3126, 3408, 3641],
  [9850, 1430, 2217, 2781, 3132, 3414, 3647],
  [9900, 1432, 2221, 2786, 3137, 3420, 3653],
  [9950, 1435, 2225, 2791, 3143, 3426, 3659],
  [10000, 1437, 2228, 2795, 3148, 3432, 3666],
];

// Marginal percentages applied to combined net income above $10,000, by number
// of children (§ 61.30(6)(b)).
const ABOVE_TOP_PCT = [0.05, 0.075, 0.095, 0.11, 0.12, 0.125];

const SCHEDULE_TOP = 10000;
const SCHEDULE_BOTTOM = 800;
const DAYS_IN_YEAR = 365;
// "Substantial amount of time" = at least 20% of the overnights (§ 61.30(11)(b)8).
export const SUBSTANTIAL_OVERNIGHT_THRESHOLD = 0.2;

const round = (n: number) => Math.round(n * 100) / 100;
const clampChildren = (n: number) => Math.min(6, Math.max(1, Math.round(n)));

/**
 * The minimum child support need for a given combined monthly net income and
 * number of children, per the § 61.30(6) schedule. Below the schedule floor the
 * lowest row is used; above the top the marginal-percentage rule applies.
 */
export function basicObligation(combinedNetMonthly: number, children: number): number {
  const kids = clampChildren(children);
  const col = kids; // SCHEDULE columns are 1..6 at indices 1..6
  const income = Math.max(0, combinedNetMonthly);

  if (income <= SCHEDULE_BOTTOM) {
    return SCHEDULE[0][col];
  }
  if (income >= SCHEDULE_TOP) {
    const top = SCHEDULE[SCHEDULE.length - 1][col];
    return round(top + (income - SCHEDULE_TOP) * ABOVE_TOP_PCT[kids - 1]);
  }
  // Find the highest schedule row whose income is <= the combined income. The
  // statute is a step table (it does not interpolate), so we take that row.
  let row = SCHEDULE[0];
  for (const r of SCHEDULE) {
    if (r[0] <= income) row = r;
    else break;
  }
  return row[col];
}

export interface ChildSupportInput {
  children: number;
  /** Monthly net income for each parent (gross less § 61.30(3) deductions). */
  netIncomeA: number;
  netIncomeB: number;
  /** Monthly child-care cost added to the obligation (§ 61.30(7)). */
  childCare: number;
  /** Monthly child health-insurance cost added to the obligation (§ 61.30(8)). */
  healthInsurance: number;
  /** How much of the child-care + health-insurance each parent actually pays. */
  prepaidA: number;
  prepaidB: number;
  /** Parent A's annual overnights (0–365). Parent B's = 365 − this. */
  overnightsA: number;
}

export interface ChildSupportResult {
  combinedNet: number;
  shareA: number; // 0..1
  shareB: number;
  basic: number; // schedule amount before add-ons
  addOns: number; // child care + health insurance
  totalObligation: number; // basic + add-ons
  /** True when each parent has >= 20% of overnights (gross-up applies). */
  grossUp: boolean;
  overnightsA: number;
  overnightsB: number;
  /** Net monthly amount one parent transfers to the other. */
  transfer: number;
  /** "A" or "B": the parent who pays the transfer. Empty when transfer is 0. */
  payor: "A" | "B" | "";
}

/**
 * Estimate the monthly child support transfer under § 61.30, including the
 * substantial-time-sharing gross-up in subsection (11)(b) when both parents
 * exercise at least 20% of overnights.
 */
export function calcChildSupport(input: ChildSupportInput): ChildSupportResult {
  const netA = Math.max(0, input.netIncomeA);
  const netB = Math.max(0, input.netIncomeB);
  const combinedNet = netA + netB;
  const shareA = combinedNet > 0 ? netA / combinedNet : 0.5;
  const shareB = combinedNet > 0 ? netB / combinedNet : 0.5;

  const basic = basicObligation(combinedNet, input.children);
  const addOns = Math.max(0, input.childCare) + Math.max(0, input.healthInsurance);
  const total = basic + addOns;

  const overnightsA = Math.min(DAYS_IN_YEAR, Math.max(0, Math.round(input.overnightsA)));
  const overnightsB = DAYS_IN_YEAR - overnightsA;
  const pctA = overnightsA / DAYS_IN_YEAR;
  const pctB = overnightsB / DAYS_IN_YEAR;

  const grossUp =
    Math.min(pctA, pctB) >= SUBSTANTIAL_OVERNIGHT_THRESHOLD;

  let transfer: number;
  let payor: "A" | "B" | "";

  if (grossUp) {
    // § 61.30(11)(b): gross up the basic obligation by 1.5, cross-multiply each
    // parent's share by the OTHER parent's overnight percentage, take the
    // difference, then adjust for net child-care / health-insurance paid.
    const grossBasic = basic * 1.5;
    const obligA = grossBasic * shareA * pctB;
    const obligB = grossBasic * shareB * pctA;
    const supportTransfer = obligA - obligB; // positive => A pays B

    // § 61.30(11)(b)5–6: adjust the transfer for child-care / health-insurance.
    // Whoever fronts a cost is reimbursed by the other parent for that other
    // parent's income share of it. Net A→B = shareA*prepaidB − shareB*prepaidA.
    const prepaidA = Math.max(0, input.prepaidA);
    const prepaidB = Math.max(0, input.prepaidB);
    const addOnTransfer = shareA * prepaidB - shareB * prepaidA;

    const net = supportTransfer + addOnTransfer; // positive => A pays B
    transfer = round(Math.abs(net));
    payor = net > 0 ? "A" : net < 0 ? "B" : "";
  } else {
    // Standard case: the parent with fewer overnights is the obligor and pays
    // their income-share of the total obligation, less what they prepaid.
    const obligor: "A" | "B" =
      overnightsA < overnightsB
        ? "A"
        : overnightsA > overnightsB
          ? "B"
          : netA >= netB
            ? "A"
            : "B";
    const share = obligor === "A" ? shareA : shareB;
    const prepaid = obligor === "A" ? input.prepaidA : input.prepaidB;
    const owed = share * total - Math.max(0, prepaid);
    transfer = round(Math.max(0, owed));
    payor = transfer > 0 ? obligor : "";
  }

  return {
    combinedNet: round(combinedNet),
    shareA,
    shareB,
    basic: round(basic),
    addOns: round(addOns),
    totalObligation: round(total),
    grossUp,
    overnightsA,
    overnightsB,
    transfer,
    payor,
  };
}

// ----------------------------------------------------------------------------
// Alimony — § 61.08 (post SB 1416)
// ----------------------------------------------------------------------------

export type MarriageTerm = "short" | "moderate" | "long";

export interface AlimonyInput {
  /** Length of the marriage in years (date of marriage to date of filing). */
  marriageYears: number;
  /** Monthly net income of each spouse. */
  netIncomePayor: number;
  netIncomePayee: number;
  /** Optional: the obligee's documented reasonable monthly need. */
  reasonableNeed?: number | null;
}

export interface AlimonyResult {
  term: MarriageTerm;
  /** True when the marriage is too short (<3 yrs) for durational alimony. */
  durationalAvailable: boolean;
  /** Statutory percentage cap on durational length for this marriage term. */
  lengthCapPct: number;
  /** Max durational length in years (lengthCapPct * marriageYears). */
  maxDurationalYears: number;
  /** 35% of the net-income difference (the amount ceiling). */
  amountCap35: number;
  /** Monthly net-income difference between the parties. */
  incomeDifference: number;
  /** Estimated monthly amount: min(reasonableNeed, 35% cap) when need given. */
  estimatedMonthlyAmount: number;
  /** True when the 35% cap (not stated need) is the binding constraint. */
  capIsBinding: boolean;
  bridgeTheGapMaxYears: number;
  rehabilitativeMaxYears: number;
}

export function marriageTerm(years: number): MarriageTerm {
  if (years < 10) return "short";
  if (years < 20) return "moderate";
  return "long";
}

/**
 * Estimate durational alimony length and amount caps under § 61.08 as amended
 * by SB 1416 (eff. July 1, 2023). Permanent alimony is no longer available.
 */
export function calcAlimony(input: AlimonyInput): AlimonyResult {
  const years = Math.max(0, input.marriageYears);
  const term = marriageTerm(years);
  const lengthCapPct = term === "short" ? 0.5 : term === "moderate" ? 0.6 : 0.75;
  const durationalAvailable = years >= 3;

  const payor = Math.max(0, input.netIncomePayor);
  const payee = Math.max(0, input.netIncomePayee);
  const incomeDifference = Math.max(0, payor - payee);
  const amountCap35 = round(0.35 * incomeDifference);

  const need = input.reasonableNeed != null ? Math.max(0, input.reasonableNeed) : null;
  // § 61.08(8)(c): amount is the lesser of reasonable need or the 35% cap.
  const estimatedMonthlyAmount =
    need != null ? round(Math.min(need, amountCap35)) : amountCap35;
  const capIsBinding = need == null || amountCap35 <= need;

  return {
    term,
    durationalAvailable,
    lengthCapPct,
    maxDurationalYears: round(lengthCapPct * years),
    amountCap35,
    incomeDifference: round(incomeDifference),
    estimatedMonthlyAmount,
    capIsBinding,
    bridgeTheGapMaxYears: 2,
    rehabilitativeMaxYears: 5,
  };
}
