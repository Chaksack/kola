/** ISO 3166-1 alpha-2 codes. Names come from Intl.DisplayNames so there's no big table to maintain. */
const CODES =
  'ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw'.split(' ')

let cache: { iso2: string; name: string }[] | null = null

export function allCountries(): { iso2: string; name: string }[] {
  if (cache) return cache
  const names = new Intl.DisplayNames(['en'], { type: 'region' })
  cache = CODES.map((iso2) => ({ iso2, name: names.of(iso2.toUpperCase()) ?? iso2.toUpperCase() })).sort((a, b) => a.name.localeCompare(b.name))
  return cache
}

export function countryName(iso2: string): string {
  return allCountries().find((c) => c.iso2 === iso2.toLowerCase())?.name ?? iso2.toUpperCase()
}

export const isCountryCode = (v: string) => CODES.includes(v.toLowerCase())
