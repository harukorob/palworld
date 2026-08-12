"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { importPalFiles } from "./pal-import";
import { PASSIVES, PASSIVE_BY_ID } from "./passive-catalog";
import { BREED_META, SPECIAL_OUTCOMES } from "./breeding-data";

type Pal = { name: string; rank: number; image: string; elements: string[] };
type Owned = { name: string; count: number; passives: string[]; sex?: string; playerId: string; playerName: string };
type Combo = { a: Pal; b: Pal; score: number };
type PathStep = {
  a: string;
  b: string;
  child: string;
  mask: number;
  generation: number;
};
type PathResult = { steps: PathStep[]; mask: number; generations: number };
const BREED_BY_NAME = new Map(BREED_META.map((p) => [p.n, p]));
const SPECIAL_CHILDREN = new Set(Object.values(SPECIAL_OUTCOMES).flat());
const demo: Pal[] = [
  {
    name: "Anubis",
    rank: 480,
    image:
      "https://palworld.gg/_ipx/q_90&s_120x120/images/full_palicon/T_Anubis_icon_normal.png",
    elements: ["Terra"],
  },
  {
    name: "Jetragon",
    rank: 70,
    image:
      "https://palworld.gg/_ipx/q_90&s_120x120/images/full_palicon/T_JetDragon_icon_normal.png",
    elements: ["Dragão"],
  },
  {
    name: "Frostallion",
    rank: 150,
    image:
      "https://palworld.gg/_ipx/q_90&s_120x120/images/full_palicon/T_IceHorse_icon_normal.png",
    elements: ["Gelo"],
  },
  {
    name: "Blazamut",
    rank: 410,
    image:
      "https://palworld.gg/_ipx/q_90&s_120x120/images/full_palicon/T_KingBahamut_icon_normal.png",
    elements: ["Fogo"],
  },
  {
    name: "Orserk",
    rank: 120,
    image:
      "https://palworld.gg/_ipx/q_90&s_120x120/images/full_palicon/T_ThunderDragonMan_icon_normal.png",
    elements: ["Elétrico"],
  },
  {
    name: "Shadowbeak",
    rank: 550,
    image:
      "https://palworld.gg/_ipx/q_90&s_120x120/images/full_palicon/T_BlackGriffon_icon_normal.png",
    elements: ["Sombrio"],
  },
  {
    name: "Gildane",
    rank: 730,
    image:
      "https://palworld.gg/_ipx/q_90&s_120x120/images/full_palicon/T_GoldenHorse_icon_normal.png",
    elements: ["Terra"],
  },
];
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
const passiveLabel = (s: string) =>
  PASSIVE_BY_ID[s]?.name ||
  s.replace(/^PassiveSkill_/i, "").replace(/_/g, " ").trim();
function PassiveBadge({ id, remove, active = true }: { id: string; remove?: () => void; active?: boolean }) {
  const passive = PASSIVE_BY_ID[id];
  if (!passive) return null;
  const arrows = Math.min(4, Math.max(1, Math.abs(passive.tier)));
  return <span className={`passive-badge tier-${passive.tier} ${active ? "active" : "muted"}`}>
    <b>{passive.name}</b>
    <i aria-label={`Raridade ${arrows}`}>{Array.from({ length: arrows }, (_, n) => <em key={n}>⌃</em>)}</i>
    {remove && <button type="button" aria-label={`Remover ${passive.name}`} onClick={(e) => { e.stopPropagation(); remove(); }}>×</button>}
  </span>;
}
function Portrait({
  pal,
  size = "md",
}: {
  pal?: Pal;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className={`portrait ${size}`}>
      <b className="pal-fallback">
        {pal?.name.slice(0, 2).toUpperCase() || "?"}
      </b>
      {pal && (
        <img
          src={pal.image}
          alt={pal.name}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
}
function walkJson(
  value: unknown,
  names: Map<string, string>,
  found: Owned[],
  depth = 0,
) {
  if (depth > 14 || value == null) return;
  if (Array.isArray(value)) {
    value.forEach((v) => walkJson(v, names, found, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  const o = value as Record<string, unknown>;
  const candidates = [
    o.CharacterID,
    o.character_id,
    o.name,
    o.Name,
    o.pal_name,
    o.PalName,
    o.species,
    o.Species,
  ].filter((v) => typeof v === "string") as string[];
  let matched: string | undefined;
  for (const c of candidates) {
    const key = norm(c.replace(/^Pal_|^BOSS_/i, ""));
    matched =
      names.get(key) ||
      [...names.entries()].find(
        ([k]) => key.includes(k) || k.includes(key),
      )?.[1];
    if (matched) break;
  }
  if (matched) {
    const raw = [
      o.PassiveSkillList,
      o.passive_skills,
      o.Passives,
      o.passives,
      o.Talent_List,
    ].find(Array.isArray) as unknown[] | undefined;
    const passives = (raw || [])
      .map((x) =>
        typeof x === "string"
          ? x
          : typeof x === "object" && x
            ? String(
                (x as Record<string, unknown>).Name ||
                  (x as Record<string, unknown>).name ||
                  "",
              )
            : "",
      )
      .filter(Boolean);
    const sex = String(o.Gender || o.gender || o.Sex || "").replace(
      "EPalGenderType::",
      "",
    );
    found.push({ name: matched, count: 1, passives, sex, playerId: "legacy", playerName: "Jogador" });
  }
  Object.values(o).forEach((v) => walkJson(v, names, found, depth + 1));
}

export default function Home() {
  const [pals, setPals] = useState<Pal[]>(demo);
  const [complete, setComplete] = useState(false);
  const [target, setTarget] = useState("Anubis");
  const [query, setQuery] = useState("");
  const [owned, setOwned] = useState<Owned[]>([]);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState("all");
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"planner" | "collection">("planner");
  const [view, setView] = useState<"combos" | "path">("combos");
  const [wanted, setWanted] = useState<string[]>([]);
  const [passiveQuery, setPassiveQuery] = useState("");
  const [passiveOpen, setPassiveOpen] = useState(false);
  const [toast, setToast] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch("/api/pals")
      .then((r) => r.json())
      .then((d) => {
        if (d.pals?.length) {
          setPals(d.pals);
          setComplete(d.complete);
          if (!d.pals.some((p: Pal) => p.name === target))
            setTarget(d.pals[0].name);
        }
      })
      .catch(() => {});
  }, []);
  const byName = useMemo(() => new Map(pals.map((p) => [p.name, p])), [pals]);
  const targetPal = byName.get(target) || pals[0];
  const players = useMemo(() => [...new Map(owned.map((x) => [x.playerId, { id: x.playerId, name: x.playerName }])).values()].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")), [owned]);
  const activeOwned = useMemo(() => selectedPlayer === "all" ? owned : owned.filter((x) => x.playerId === selectedPlayer), [owned, selectedPlayer]);
  const ownedNames = useMemo(() => new Set(activeOwned.map((x) => x.name)), [activeOwned]);
  const passiveOptions = useMemo(
    () =>
      PASSIVES.filter((p) => !wanted.includes(p.id) && norm(p.name).includes(norm(passiveQuery)))
        .sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name, "pt-BR"))
        .slice(0, 40),
    [wanted, passiveQuery],
  );
  const normalCandidates = useMemo(
    () => BREED_META.filter((p) => p.s && p.r !== null && !SPECIAL_CHILDREN.has(p.n)),
    [],
  );
  const breedOutcomes = useMemo(() => {
    return (a: string, b: string) => {
      const pa = BREED_BY_NAME.get(a), pb = BREED_BY_NAME.get(b);
      if (!pa?.e || !pb?.e || pa.r === null || pb.r === null) return [];
      const special = SPECIAL_OUTCOMES[[a, b].sort().join("|")];
      if (special?.length) return special;
      if (a === b) return [a];
      const avg = Math.floor((pa.r + pb.r + 1) / 2);
      const distance = Math.min(...normalCandidates.map((p) => Math.abs(p.r! - avg)));
      const tied = normalCandidates.filter((p) => Math.abs(p.r! - avg) === distance);
      tied.sort((x, y) => (y.p ?? -Infinity) - (x.p ?? -Infinity) || x.i - y.i);
      return tied[0] ? [tied[0].n] : [];
    };
  }, [normalCandidates]);
  const combos = useMemo(() => {
    if (!targetPal) return [];
    const out: Combo[] = [];
    for (let i = 0; i < pals.length; i++)
      for (let j = i; j < pals.length; j++) {
        const a = pals[i],
          b = pals[j];
        if (!BREED_BY_NAME.get(a.name)?.e || !BREED_BY_NAME.get(b.name)?.e) continue;
        if (ownedOnly && (!ownedNames.has(a.name) || !ownedNames.has(b.name)))
          continue;
        const avg = Math.floor((a.rank + b.rank + 1) / 2);
        const distance = Math.abs(avg - targetPal.rank);
        if (
          breedOutcomes(a.name, b.name).includes(target) &&
          !out.some(
            (x) =>
              (x.a.name === a.name && x.b.name === b.name) ||
              (x.a.name === b.name && x.b.name === a.name),
          )
        )
          out.push({ a, b, score: distance });
      }
    return out
      .sort(
        (x, y) =>
          x.score - y.score ||
          Number(!(ownedNames.has(x.a.name) && ownedNames.has(x.b.name))) -
            Number(!(ownedNames.has(y.a.name) && ownedNames.has(y.b.name))),
      )
      .slice(0, 120);
  }, [pals, targetPal, target, ownedOnly, ownedNames, breedOutcomes]);
  const filtered = pals
    .filter((p) => norm(p.name).includes(norm(query)))
    .slice(0, 80);
  const current = combos[Math.min(selected, Math.max(0, combos.length - 1))];
  const breedingPath = useMemo<PathResult | null>(() => {
    if (!activeOwned.length || !targetPal) return null;
    const wantedIndex = new Map(wanted.map((x, i) => [x, i]));
    type State = {
      name: string;
      mask: number;
      steps: PathStep[];
      generation: number;
    };
    const best = new Map<string, State>();
    const seed: State[] = [];
    activeOwned.forEach((o) => {
      let mask = 0;
      o.passives.forEach((p) => {
        const i = wantedIndex.get(p);
        if (i !== undefined) mask |= 1 << i;
      });
      const state = { name: o.name, mask, steps: [], generation: 0 };
      const key = `${state.name}|${mask}`;
      if (!best.has(key)) {
        best.set(key, state);
        seed.push(state);
      }
    });
    if (!seed.length) return null;
    const desired = (1 << wanted.length) - 1;
    const score = (s: State) =>
      s.generation * 100 +
      (wanted.length - (s.mask.toString(2).match(/1/g) || []).length) * 18 +
      s.steps.length;
    let frontier = [...seed];
    // Um Pal já existente nunca encerra a busca: o objetivo desta tela é
    // encontrar uma rota para produzir um novo exemplar.
    let winners: State[] = [];
    for (
      let round = 1;
      round <= 5 && !winners.some((s) => s.mask === desired);
      round++
    ) {
      const pool = [...best.values()]
        .sort((a, b) => score(a) - score(b))
        .slice(0, 700);
      const next: State[] = [];
      for (const left of frontier.slice(0, 260)) {
        for (const right of pool) {
          for (const child of breedOutcomes(left.name, right.name)) {
          const mask = left.mask | right.mask;
          const generation = Math.max(left.generation, right.generation) + 1;
          const combined = [...left.steps, ...right.steps];
          const uniq = new Map(
            combined.map((s) => [`${s.a}|${s.b}|${s.child}|${s.mask}`, s]),
          );
          const step: PathStep = {
            a: left.name,
            b: right.name,
            child,
            mask,
            generation,
          };
          uniq.set(`${step.a}|${step.b}|${step.child}|${step.mask}`, step);
          const state = {
            name: child,
            mask,
            steps: [...uniq.values()].sort(
              (a, b) => a.generation - b.generation,
            ),
            generation,
          };
          if (child === target) winners.push(state);
          const key = `${child}|${mask}`;
          const old = best.get(key);
          if (
            !old ||
            state.generation < old.generation ||
            (state.generation === old.generation &&
              state.steps.length < old.steps.length)
          ) {
            best.set(key, state);
            next.push(state);
          }
          }
        }
      }
      frontier = next.sort((a, b) => score(a) - score(b)).slice(0, 300);
    }
    if (!winners.length) return null;
    const eligibleWinners = wanted.length
      ? winners.filter((s) => s.mask === desired && s.steps.length > 0)
      : winners.filter((s) => s.steps.length > 0);
    if (!eligibleWinners.length) return null;
    const chosen = eligibleWinners.sort(
      (a, b) =>
        Number(b.mask === desired) - Number(a.mask === desired) ||
        score(a) - score(b),
    )[0];
    return {
      steps: chosen.steps,
      mask: chosen.mask,
      generations: chosen.generation,
    };
  }, [activeOwned, targetPal, target, wanted, breedOutcomes]);
  function togglePassive(p: string) {
    setWanted((old) =>
      old.includes(p) || old.length >= 4 ? old : [...old, p],
    );
    setPassiveQuery("");
    setPassiveOpen(false);
    setView("path");
  }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setToast("Lendo os arquivos do save...");
    const result = await importPalFiles(
      Array.from(files),
      new Set(pals.map((p) => p.name)),
    );
    const all: Owned[] = result.pals;
    const merged = new Map<string, Owned>();
    all.forEach((p) => {
      const key =
        p.playerId + "|" + p.name + "|" + [...p.passives].sort().join(",") + "|" + (p.sex || "");
      const old = merged.get(key);
      merged.set(key, old ? { ...old, count: old.count + 1 } : p);
    });
    setOwned([...merged.values()]);
    setSelectedPlayer("all");
    setWanted([]);
    setOwnedOnly(true);
    setTab("planner");
    setView("path");
    setToast(
      `${all.length} Pals reconhecidos · ${result.players} jogador(es)${result.ignored ? ` · ${result.ignored} arquivo(s) ignorado(s)` : ""}${result.unmapped ? ` · ${result.unmapped} espécie(s) ainda não mapeada(s)` : ""}${result.failed ? ` · ${result.failed} arquivo(s) inválido(s)` : ""}`,
    );
    setTimeout(() => setToast(""), 5000);
  }
  return (
    <main className="app">
      <header className="topbar">
        <a className="brand" href="#top">
          <i>PP</i>
          <span>
            PAL<span>//</span>PLANNER
          </span>
        </a>
        <nav>
          <button
            className={tab === "planner" ? "active" : ""}
            onClick={() => setTab("planner")}
          >
            PLANEJADOR
          </button>
          <button
            className={tab === "collection" ? "active" : ""}
            onClick={() => setTab("collection")}
          >
            MEUS PALS <b>{owned.reduce((n, p) => n + p.count, 0)}</b>
          </button>
        </nav>
        <button className="import-top" onClick={() => input.current?.click()}>
          ⇧ IMPORTAR JSON
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept=".json,application/json"
          multiple
          onChange={(e) => importFiles(e.target.files)}
        />
      </header>
      {toast && <div className="toast">✓ {toast}</div>}
      {tab === "planner" ? (
        <>
          <section id="top" className="hero">
            <div className="hero-copy">
              <span className="signal">
                <i /> BASE PALWORLD 1.0
              </span>
              <h1>
                CALCULADORA<br />
                <em>GENÉTICA<br />PALWORLD.</em>
              </h1>
              <p>
                Encontre o caminho para seus Pals com as passivas desejadas.
              </p>
              <div className="hero-actions">
                <a href="#planner">
                  INICIAR PLANEJAMENTO <b>→</b>
                </a>
                <button onClick={() => input.current?.click()}>
                  IMPORTAR MEUS PALS
                </button>
              </div>
              <div className="live-stats">
                <span>
                  <b>{pals.length}</b> PALS MAPEADOS
                </span>
                <span>
                  <b>{complete ? "LIVE" : "CACHE"}</b> BASE ATUALIZADA
                </span>
                <span>
                  <b>LOCAL</b> JSON PRIVADO
                </span>
              </div>
            </div>
            <div className="hero-pals">
              <div className="orb one">
                <Portrait pal={byName.get("Jetragon") || demo[1]} size="lg" />
              </div>
              <div className="orb two">
                <Portrait pal={byName.get("Anubis") || demo[0]} size="lg" />
              </div>
              <div className="orb three">
                <Portrait
                  pal={byName.get("Frostallion") || demo[2]}
                  size="lg"
                />
              </div>
              <div className="scanline" />
            </div>
          </section>
          <section id="planner" className="workspace">
            <aside>
              <div className="aside-title">
                <span>01</span>
                <div>
                  <small>PAL DESEJADO</small>
                  <h2>Selecione o alvo</h2>
                </div>
              </div>
              <label className="search">
                <span>⌕</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar entre todos os Pals..."
                />
                <kbd>{filtered.length}</kbd>
              </label>
              <div className="pal-grid">
                {filtered.map((p) => (
                  <button
                    key={p.name}
                    className={target === p.name ? "selected" : ""}
                    onClick={() => {
                      setTarget(p.name);
                      setSelected(0);
                    }}
                  >
                    <Portrait pal={p} size="sm" />
                    <span>
                      <b>{p.name}</b>
                      <small>
                        {p.elements.join(" · ") || `Rank ${p.rank}`}
                      </small>
                    </span>
                    {ownedNames.has(p.name) && <i>✓</i>}
                  </button>
                ))}
              </div>
              <div className="owned-filter">
                <div>
                  <b>FILTRAR PELA MINHA PALBOX</b>
                  <small>Somente pais disponíveis no seu save</small>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={ownedOnly}
                    onChange={(e) => {
                      setOwnedOnly(e.target.checked);
                      setSelected(0);
                    }}
                  />
                  <i />
                </label>
              </div>
              {players.length > 1 && <div className="player-filter">
                <label htmlFor="player-filter">JOGADOR CONSIDERADO</label>
                <select id="player-filter" value={selectedPlayer} onChange={(e) => { setSelectedPlayer(e.target.value); setSelected(0); }}>
                  <option value="all">Todos os jogadores ({owned.reduce((n,p)=>n+p.count,0)} Pals)</option>
                  {players.map((player) => <option key={player.id} value={player.id}>{player.name} ({owned.filter((p)=>p.playerId===player.id).reduce((n,p)=>n+p.count,0)} Pals)</option>)}
                </select>
                <small>Combinações, caminho genético e passivas usarão apenas esta Palbox.</small>
              </div>}
              {owned.length > 0 && (
                <div className="passive-picker">
                  <div className="passive-title">
                    <b>PASSIVAS DESEJADAS</b>
                    <small>{wanted.length}/4 selecionadas</small>
                  </div>
                  {wanted.length > 0 && <div className="selected-passives">
                    {wanted.map((p) => <PassiveBadge key={p} id={p} remove={() => setWanted((old) => old.filter((x) => x !== p))} />)}
                  </div>}
                  <div className="passive-search-wrap">
                    <label className="passive-search">
                      <span>⌕</span>
                      <input value={passiveQuery} disabled={wanted.length >= 4}
                        placeholder={wanted.length >= 4 ? "Limite de 4 passivas atingido" : "Pesquisar passiva..."}
                        onFocus={() => setPassiveOpen(true)} onBlur={() => setTimeout(() => setPassiveOpen(false), 120)}
                        onChange={(e) => { setPassiveQuery(e.target.value); setPassiveOpen(true); }} />
                    </label>
                    {passiveOpen && wanted.length < 4 && <div className="passive-menu">
                      {passiveOptions.length ? passiveOptions.map((p) => (
                        <button type="button" key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => togglePassive(p.id)}>
                          <PassiveBadge id={p.id} />
                        </button>
                      )) : <small>Nenhuma passiva encontrada</small>}
                    </div>}
                  </div>
                </div>
              )}
              <button
                className="dropzone"
                onClick={() => input.current?.click()}
              >
                <span>⇧</span>
                <b>
                  {owned.length
                    ? "ATUALIZAR JSON DOS JOGADORES"
                    : "IMPORTAR JSON DOS JOGADORES"}
                </b>
                <small>Aceita múltiplos arquivos convertidos</small>
              </button>
            </aside>
            <section className="results">
              <div className="result-header">
                <div>
                  <small>
                    {view === "path" ? "BREEDING PATH" : "MATRIZ DE CRUZAMENTO"}
                  </small>
                  <h2>
                    <Portrait pal={targetPal} size="sm" />
                    {target}
                  </h2>
                </div>
                <div>
                  <strong>
                    {view === "path" ? (breedingPath?.generations ?? 0) : combos.length}
                  </strong>
                  <span>{view === "path" ? "GERAÇÕES" : "ROTAS ENCONTRADAS"}</span>
                </div>
              </div>
              <div className="result-tabs">
                <button
                  className={view === "combos" ? "active" : ""}
                  onClick={() => setView("combos")}
                >
                  COMBINAÇÕES DIRETAS
                </button>
                <button
                  className={view === "path" ? "active" : ""}
                  onClick={() => setView("path")}
                >
                  CAMINHO GENÉTICO {owned.length ? <b>PALBOX</b> : <i>JSON</i>}
                </button>
              </div>
              {view === "combos" ? <div className="route-body">
                <div className="route-list">
                  {combos.length ? (
                    combos.map((c, i) => (
                      <button
                        key={`${c.a.name}-${c.b.name}`}
                        className={selected === i ? "selected" : ""}
                        onClick={() => setSelected(i)}
                      >
                        <span className="route-number">
                          #{String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="duo">
                          <Portrait pal={c.a} size="sm" />
                          <i>+</i>
                          <Portrait pal={c.b} size="sm" />
                        </div>
                        <div className="route-names">
                          <b>{c.a.name}</b>
                          <span>×</span>
                          <b>{c.b.name}</b>
                        </div>
                        {ownedNames.has(c.a.name) &&
                        ownedNames.has(c.b.name) ? (
                          <em>DISPONÍVEL</em>
                        ) : (
                          <small>Breeding rank Δ {c.score}</small>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="empty">
                      <span>⌁</span>
                      <b>NENHUMA ROTA DISPONÍVEL</b>
                      <p>
                        Importe outros jogadores ou desligue o filtro da Palbox.
                      </p>
                    </div>
                  )}
                </div>
                <div className="route-detail">
                  {current ? (
                    <>
                      <div className="detail-heading">
                        <span>ROTA SELECIONADA</span>
                        <b>BREEDING RANK #{targetPal?.rank}</b>
                      </div>
                      <div className="breeding-stage">
                        <div className="pal-node">
                          <Portrait pal={current.a} size="lg" />
                          <span>PROGENITOR A</span>
                          <b>{current.a.name}</b>
                          {ownedNames.has(current.a.name) && <em>NA PALBOX</em>}
                        </div>
                        <div className="fusion">
                          <i />
                          <b>×</b>
                          <i />
                        </div>
                        <div className="pal-node">
                          <Portrait pal={current.b} size="lg" />
                          <span>PROGENITOR B</span>
                          <b>{current.b.name}</b>
                          {ownedNames.has(current.b.name) && <em>NA PALBOX</em>}
                        </div>
                        <div className="energy">
                          <i />
                          <b>⌄</b>
                        </div>
                        <div className="child">
                          <div className="glow">
                            <Portrait pal={targetPal} size="lg" />
                          </div>
                          <div>
                            <span>RESULTADO</span>
                            <b>{target}</b>
                            <small>
                              {targetPal?.elements.join(" / ") || "Pal"}
                            </small>
                          </div>
                          <strong>100%</strong>
                        </div>
                      </div>
                      <div className="intel">
                        <div>
                          <span>⌁</span>
                          <p>
                            <b>COMBINAÇÃO CALCULADA</b>
                            <small>
                              Média dos breeding ranks dos progenitores com
                              desempate pela proximidade do alvo.
                            </small>
                          </p>
                        </div>
                        <div>
                          <span>◈</span>
                          <p>
                            <b>HERANÇA DE PASSIVAS</b>
                            <small>
                              Use os JSON importados para localizar os melhores
                              portadores de cada passiva.
                            </small>
                          </p>
                        </div>
                      </div>
                      <button className="plan-button">
                        ADICIONAR AO PLANO DE CRUZAMENTO <span>→</span>
                      </button>
                    </>
                  ) : (
                    <div className="empty detail-empty">
                      <span>⌁</span>
                      <b>SEM RESULTADOS</b>
                    </div>
                  )}
                </div>
              </div> : <div className="path-panel">
                {!owned.length ? (
                  <div className="path-lock">
                    <span>JSON</span>
                    <h3>IMPORTE SUA PALBOX</h3>
                    <p>O caminho genético parte dos Pals que você realmente possui. A seleção de passivas também é liberada após a importação.</p>
                    <button onClick={() => input.current?.click()}>IMPORTAR ARQUIVOS JSON</button>
                  </div>
                ) : breedingPath ? (
                  <>
                    <div className="path-summary">
                      <div><span>MELHOR CAMINHO</span><b>{breedingPath.generations} {breedingPath.generations === 1 ? "geração" : "gerações"}</b></div>
                      <div><span>PASSIVAS COBERTAS</span><b>{wanted.length ? `${wanted.filter((_, i) => breedingPath.mask & (1 << i)).length}/${wanted.length}` : "Sem filtro"}</b></div>
                      <div><span>ETAPAS DE CRUZAMENTO</span><b>{breedingPath.steps.length}</b></div>
                    </div>
                    {wanted.length > 0 && <div className="wanted-strip">{wanted.map((p, i) => <PassiveBadge id={p} active={!!(breedingPath.mask & (1 << i))} key={p} />)}</div>}
                    <div className="path-timeline">
                      {breedingPath.steps.map((s, i) => (
                        <article key={`${s.a}-${s.b}-${s.child}-${i}`}>
                          <div className="path-index"><span>ETAPA {String(i + 1).padStart(2, "0")}</span><b>GERAÇÃO {s.generation}</b></div>
                          <div className="path-cross">
                            <div><Portrait pal={byName.get(s.a)} size="md"/><p><small>{ownedNames.has(s.a) ? "DA PALBOX" : "DESCENDENTE"}</small><b>{s.a}</b></p></div>
                            <i>×</i>
                            <div><Portrait pal={byName.get(s.b)} size="md"/><p><small>{ownedNames.has(s.b) ? "DA PALBOX" : "DESCENDENTE"}</small><b>{s.b}</b></p></div>
                            <em>→</em>
                            <div className="path-child"><Portrait pal={byName.get(s.child)} size="md"/><p><small>RESULTADO</small><b>{s.child}</b></p></div>
                          </div>
                          {wanted.length > 0 && <div className="step-passives">{wanted.map((p, pi) => <PassiveBadge id={p} active={!!(s.mask & (1 << pi))} key={p} />)}</div>}
                        </article>
                      ))}
                    </div>
                    <p className="inherit-note">A rota maximiza a presença dos portadores. A herança de passivas continua sujeita à probabilidade do jogo; não representa garantia de 100% no ovo.</p>
                  </>
                ) : (
                  <div className="path-lock"><span>⌁</span><h3>ROTA NÃO ENCONTRADA</h3><p>Não foi possível formar este Pal em até cinco gerações com os Pals importados e os filtros atuais.</p></div>
                )}
              </div>}
            </section>
          </section>
        </>
      ) : (
        <section className="collection">
          <div className="collection-head">
            <span>PALBOX INTELLIGENCE</span>
            <h1>
              SEUS PALS.
              <br />
              <em>SUAS ROTAS.</em>
            </h1>
            <p>
              Os arquivos são lidos localmente no navegador e não são enviados
              para nenhum servidor.
            </p>
            <button onClick={() => input.current?.click()}>
              ⇧ ADICIONAR JSON
            </button>
          </div>
          {owned.length ? (
            <>
              <div className="collection-stats">
                <div>
                  <b>{owned.reduce((n, p) => n + p.count, 0)}</b>
                  <span>INSTÂNCIAS</span>
                </div>
                <div>
                  <b>{new Set(owned.map((p) => p.name)).size}</b>
                  <span>ESPÉCIES</span>
                </div>
                <div>
                  <b>{new Set(owned.flatMap((p) => p.passives)).size}</b>
                  <span>PASSIVAS</span>
                </div>
              </div>
              <div className="owned-cards">
                {players.map((player) => <section className="player-group" key={player.id}>
                  <header><div><span>{player.name.slice(0,2).toUpperCase()}</span><div><small>JOGADOR</small><h2>{player.name}</h2></div></div><b>{owned.filter((p)=>p.playerId===player.id).reduce((n,p)=>n+p.count,0)} PALS</b></header>
                  <div className="player-pal-grid">
                  {owned.filter((o)=>o.playerId===player.id).map((o, i) => {
                    const p = byName.get(o.name);
                    return <article key={o.name + i}>
                      <Portrait pal={p} size="md" />
                      <div>
                        <small>{o.sex || "PAL IMPORTADO"}</small>
                        <h3>
                          {o.name}
                          <b>×{o.count}</b>
                        </h3>
                        <div>
                          {o.passives.length ? (
                            o.passives.slice(0, 4).map((x) => <PassiveBadge key={x} id={x} />)
                          ) : (
                            <span className="none">
                              Sem passivas identificadas
                            </span>
                          )}
                        </div>
                      </div>
                    </article>;
                  })}
                  </div>
                </section>)}
              </div>
            </>
          ) : (
            <div className="import-empty">
              <span>JSON</span>
              <h2>Sua Palbox ainda está vazia</h2>
              <p>
                Importe os arquivos JSON resultantes da conversão do Level.sav e
                dos arquivos de jogadores. Você pode selecionar todos de uma
                vez.
              </p>
              <button onClick={() => input.current?.click()}>
                SELECIONAR ARQUIVOS
              </button>
            </div>
          )}
        </section>
      )}
      <footer>
        <div className="brand">
          <i>PP</i>
          <span>
            PAL<span>//</span>PLANNER
          </span>
        </div>
        <p>
          Ferramenta independente. Palworld e seus personagens pertencem à
          Pocketpair.
        </p>
        <a
          href="https://palworld.gg/breeding-calculator"
          target="_blank"
          rel="noreferrer"
        >
          Dados e retratos: Palworld.gg ↗
        </a>
      </footer>
    </main>
  );
}
