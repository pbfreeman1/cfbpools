// master_teams.conference values: 'SEC', 'Big Ten', 'ACC', 'Big 12',
// 'American Athletic', 'Sun Belt', 'Mid-American', 'Conference USA',
// 'Mountain West', 'Pac-12', 'FBS Independents', and 'FCS' (the 'FCS'
// bucket is a literal sentinel covering all non-FBS teams, incl. D2/D3 —
// there is no dedicated classification column).
export function isFbsConference(conf: string | null): boolean {
  return conf != null && conf !== "FCS";
}

export function isSecConference(conf: string | null): boolean {
  return conf === "SEC";
}
