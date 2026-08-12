"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { importPalFiles } from "./pal-import";
import { PASSIVES, PASSIVE_BY_ID } from "./passive-catalog";
import { BREED_META, SPECIAL_OUTCOMES } from "./breeding-data";

type Pal = { name: string; rank: number; image: string; elements: string[] };
type Owned = { name: string; count: number; passives: string[]; sex?: string; playerId: string; playerName: string };
type Combo = { a: Pal; b: Pal; score: number };
type PathTreeNode = {
  id: string;
  name: string;
  passives: string[];
  owned: boolean;
  sex?: string;
  generation: number;
  left?: PathTreeNode;
  right?: PathTreeNode;
};
type PathResult = {
  tree: PathTreeNode;
  mask: number;
  generations: number;
  crossings: number;
};
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

function BreedingTree({
  result,
  byName,
}: {
  result: PathResult;
  byName: Map<string, Pal>;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, x: 0, y: 0, ox: 0, oy: 0 });
  const nodeDrag = useRef({ id: "", active: false, x: 0, y: 0, ox: 0, oy: 0 });
  const [scale, setScale] = useState(0.9);
  const [offset, setOffset] = useState({ x: 40, y: 28 });
  const [dragging, setDragging] = useState(false);
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setScale((current) => Math.min(1.6, Math.max(0.45, current + (event.deltaY < 0 ? 0.08 : -0.08))));
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  type Positioned = { node: PathTreeNode; renderId: string; x: number; y: number };
  const layout = useMemo(() => {
    const nodes: Positioned[] = [];
    const edges: { from: Positioned; to: Positioned }[] = [];
    let leaf = 0;
    const place = (node: PathTreeNode, depth: number, renderId: string): Positioned => {
      const children = [node.left, node.right].filter(Boolean) as PathTreeNode[];
      let placed: Positioned[] = [];
      let x: number;
      if (!children.length) {
        x = 150 + leaf++ * 320;
      } else {
        placed = children.map((child, index) => place(child, depth + 1, `${renderId}-${index === 0 ? "L" : "R"}`));
        x = placed.reduce((sum, child) => sum + child.x, 0) / placed.length;
      }
      const positioned = { node, renderId, x, y: 48 + depth * 285 };
      nodes.push(positioned);
      placed.forEach((child) => edges.push({ from: positioned, to: child }));
      return positioned;
    };
    place(result.tree, 0, "root");
    const maxDepth = Math.max(...nodes.map((item) => item.node.generation));
    return {
      nodes,
      edges,
      width: Math.max(980, leaf * 320 + 140),
      height: Math.max(650, (maxDepth + 1) * 285 + 230),
    };
  }, [result]);

  const changeZoom = (next: number) => setScale(Math.min(1.6, Math.max(0.45, next)));
  const positionOf = (item: Positioned) => {
    const manual = nodeOffsets[item.renderId] || { x: 0, y: 0 };
    return { x: item.x + manual.x, y: item.y + manual.y };
  };
  const resetView = () => {
    const available = viewport.current?.clientWidth || 1000;
    const fitted = Math.min(1, Math.max(0.45, (available - 56) / layout.width));
    setScale(fitted);
    setOffset({ x: 28, y: 28 });
  };

  return <div className="tree-shell">
    <div className="tree-toolbar" aria-label="Controles da árvore">
      <button type="button" onClick={() => changeZoom(scale + 0.1)} aria-label="Aumentar zoom">＋</button>
      <button type="button" onClick={() => changeZoom(scale - 0.1)} aria-label="Diminuir zoom">−</button>
      <button type="button" onClick={resetView} aria-label="Ajustar árvore à tela">⌗</button>
      <b>{Math.round(scale * 100)}%</b>
    </div>
    <div
      className={`tree-viewport ${dragging ? "dragging" : ""}`}
      ref={viewport}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        drag.current = { active: true, x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current.active) return;
        setOffset({
          x: drag.current.ox + event.clientX - drag.current.x,
          y: drag.current.oy + event.clientY - drag.current.y,
        });
      }}
      onPointerUp={(event) => {
        drag.current.active = false;
        setDragging(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current.active = false; setDragging(false); }}
    >
      <div
        className="tree-stage"
        style={{ width: layout.width, height: layout.height, transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      >
        <svg className="tree-lines" width={layout.width} height={layout.height} aria-hidden="true">
          {layout.edges.map(({ from, to }, index) => {
            const parent = positionOf(from);
            const child = positionOf(to);
            const startY = parent.y + 188;
            const endY = child.y;
            const middleY = startY + (endY - startY) / 2;
            return <path key={index} d={`M ${parent.x} ${startY} V ${middleY} H ${child.x} V ${endY}`} />;
          })}
        </svg>
        {layout.nodes.map(({ node, renderId, x, y }) => {
          const isTarget = renderId === "root";
          const manual = nodeOffsets[renderId] || { x: 0, y: 0 };
          return <article
            className={`tree-pal ${node.owned ? "owned" : "planned"} ${isTarget ? "target" : ""}`}
            style={{ left: x + manual.x, top: y + manual.y }}
            key={renderId}
            onPointerDown={(event) => {
              event.stopPropagation();
              nodeDrag.current = { id: renderId, active: true, x: event.clientX, y: event.clientY, ox: manual.x, oy: manual.y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!nodeDrag.current.active || nodeDrag.current.id !== renderId) return;
              event.stopPropagation();
              setNodeOffsets((old) => ({ ...old, [renderId]: {
                x: nodeDrag.current.ox + (event.clientX - nodeDrag.current.x) / scale,
                y: nodeDrag.current.oy + (event.clientY - nodeDrag.current.y) / scale,
              }}));
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              nodeDrag.current.active = false;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { nodeDrag.current.active = false; }}
          >
            {isTarget && <span className="tree-crown">♛</span>}
            <header>
              <Portrait pal={byName.get(node.name)} size="md" />
              <div>
                <h4>{node.name} {node.sex === "Macho" || node.sex === "Male" ? <em className="male">♂</em> : node.sex === "Fêmea" || node.sex === "Female" ? <em className="female">♀</em> : null}</h4>
                <small>{isTarget ? "ALVO" : node.owned ? "NA PALBOX" : "CRUZAR PRIMEIRO"}</small>
              </div>
            </header>
            <div className="tree-passives">
              {node.passives.length
                ? node.passives.slice(0, 4).map((passive) => <PassiveBadge id={passive} key={passive} />)
                : <span>SEM PASSIVAS</span>}
            </div>
            <footer>{isTarget ? "TARGET" : node.owned ? "OWNED" : "BREED"}</footer>
          </article>;
        })}
      </div>
      <span className="tree-hint">Arraste para mover · Use a roda para dar zoom</span>
    </div>
  </div>;
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
      id: string;
      name: string;
      mask: number;
      unwanted: number;
      crossings: number;
      generation: number;
      tree: PathTreeNode;
    };
    const best = new Map<string, State>();
    const seed: State[] = [];
    activeOwned.forEach((o, index) => {
      let mask = 0;
      o.passives.forEach((p) => {
        const i = wantedIndex.get(p);
        if (i !== undefined) mask |= 1 << i;
      });
      const unwanted = o.passives.filter((p) => !wantedIndex.has(p)).length;
      const id = `owned-${index}-${norm(o.name)}`;
      const state: State = {
        id,
        name: o.name,
        mask,
        unwanted,
        crossings: 0,
        generation: 0,
        tree: { id, name: o.name, passives: o.passives, owned: true, sex: o.sex, generation: 0 },
      };
      // Mantém a versão mais limpa de cada espécie/conjunto de passivas no topo,
      // sem descartar instâncias alternativas que possam ter sexo diferente.
      const key = `${state.name}|${mask}|${o.sex || ""}`;
      const old = best.get(key);
      if (!old || state.unwanted < old.unwanted) best.set(key, state);
      seed.push(state);
    });
    if (!seed.length) return null;
    const desired = (1 << wanted.length) - 1;
    const bitCount = (mask: number) => (mask.toString(2).match(/1/g) || []).length;
    // Passivas desejadas dominam o ranking. Entre rotas com a mesma cobertura,
    // Pals limpos vêm antes dos portadores de passivas indesejadas.
    const score = (s: State) =>
      (wanted.length - bitCount(s.mask)) * 1_000_000 +
      s.unwanted * 10_000 +
      s.generation * 100 +
      s.crossings;
    let frontier = [...best.values()].sort((a, b) => score(a) - score(b));
    // Um Pal já existente nunca encerra a busca: o objetivo desta tela é
    // encontrar uma rota para produzir um novo exemplar.
    const winners: State[] = [];
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
            const passives = wanted.filter((_, i) => mask & (1 << i));
            const id = `breed-${round}-${norm(child)}-${left.id}-${right.id}`;
            const state: State = {
              id,
              name: child,
              mask,
              // A rota orienta selecionar, entre os ovos, um descendente apenas
              // com as passivas desejadas. Passivas extras não são propagadas.
              unwanted: 0,
              crossings: left.crossings + right.crossings + 1,
              generation,
              tree: {
                id,
                name: child,
                passives,
                owned: false,
                generation,
                left: left.tree,
                right: right.tree,
              },
            };
            if (child === target) winners.push(state);
            const key = `${child}|${mask}`;
            const old = best.get(key);
            if (!old || score(state) < score(old)) {
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
      ? winners.filter((s) => s.mask === desired && s.crossings > 0)
      : winners.filter((s) => s.crossings > 0);
    if (!eligibleWinners.length) return null;
    const chosen = eligibleWinners.sort(
      (a, b) =>
        Number(b.mask === desired) - Number(a.mask === desired) ||
        score(a) - score(b),
    )[0];
    return {
      tree: chosen.tree,
      mask: chosen.mask,
      generations: chosen.generation,
      crossings: chosen.crossings,
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
            PAL<span>{"//"}</span>PLANNER
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
                      <div><span>ETAPAS DE CRUZAMENTO</span><b>{breedingPath.crossings}</b></div>
                    </div>
                    {wanted.length > 0 && <div className="wanted-strip">{wanted.map((p, i) => <PassiveBadge id={p} active={!!(breedingPath.mask & (1 << i))} key={p} />)}</div>}
                    <BreedingTree result={breedingPath} byName={byName} />
                    <p className="inherit-note">Verde indica um Pal já presente na Palbox; dourado indica um Pal que precisa ser produzido. Em cada cruzamento, selecione um descendente apenas com as passivas exibidas antes de avançar. A herança continua sujeita à probabilidade do jogo.</p>
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
            PAL<span>{"//"}</span>PLANNER
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
