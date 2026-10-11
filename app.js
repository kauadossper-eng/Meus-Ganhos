(function () {
  "use strict";

  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const fmt = v => brl.format(v || 0);
  const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const MESES_LONGO = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, "0");
  const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- estado ----
  let entries = [];          // {id, data:"AAAA-MM-DD", valor, funcao, criadoEm}
  let metas = {};            // {"AAAA-MM": valor}
  let colGanhos = null, colMetas = null;
  let pararGanhos = null, pararMetas = null;
  let carregou = false;
  let idsVistos = new Set();
  let pendingDel = null;
  let editandoId = null;
  let backupPendente = null;
  const agora = new Date();
  let selY = agora.getFullYear(), selM = agora.getMonth();

  const hojeISO = () => { const h = new Date(); return `${h.getFullYear()}-${pad(h.getMonth() + 1)}-${pad(h.getDate())}`; };
  const chaveMes = (y, m) => `${y}-${pad(m + 1)}`;
  const doMesDe = k => entries.filter(e => e.data && e.data.slice(0, 7) === k);

  function lerLocal(k, padrao) { try { const v = localStorage.getItem(k); return v === null ? padrao : v; } catch (e) { return padrao; } }
  function gravarLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function parseValor(s) {
    s = String(s).trim().replace(/[R$\s]/g, "");
    if (!s) return NaN;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }
  const valorParaCampo = v => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sum = list => list.reduce((a, e) => a + (Number(e.valor) || 0), 0);

  // ---- aviso rápido ----
  let toastTimer = null;
  function toast(texto, erro) {
    const t = $("toast");
    t.textContent = texto;
    t.classList.toggle("erro", !!erro);
    t.classList.add("visivel");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("visivel"), erro ? 4500 : 2600);
  }
  function msg(t, err) { const m = $("f-msg"); m.textContent = t; if (err) m.setAttribute("data-err", ""); else m.removeAttribute("data-err"); }
  function setStatus(t, warn) { const s = $("status"); s.textContent = t; if (warn) s.setAttribute("data-warn", ""); else s.removeAttribute("data-warn"); }

  // ---- números que contam até o valor ----
  const ultimoValor = new WeakMap();
  function animarValor(el, valor) {
    const de = ultimoValor.has(el) ? ultimoValor.get(el) : 0;
    ultimoValor.set(el, valor);
    if (menosMovimento || de === valor) { el.textContent = fmt(valor); return; }
    cancelAnimationFrame(el._raf);
    const t0 = performance.now(), dur = 700;
    const passo = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(de + (valor - de) * e);
      if (p < 1) el._raf = requestAnimationFrame(passo);
    };
    el._raf = requestAnimationFrame(passo);
  }

  // ================= RENDER =================
  function render() {
    const total = sum(entries);
    animarValor($("total-geral"), total);
    const dias = entries.length;
    $("total-sub").textContent = dias ? `${dias} ${dias === 1 ? "dia trabalhado" : "dias trabalhados"}` : "Nenhum dia registrado ainda";

    const key = chaveMes(selY, selM);
    const doMes = doMesDe(key).sort((a, b) => b.data.localeCompare(a.data) || String(b.criadoEm).localeCompare(String(a.criadoEm)));
    const tm = sum(doMes), n = doMes.length;
    $("month-name").textContent = `${MESES_LONGO[selM]} ${selY}`;
    animarValor($("total-mes"), tm);
    $("mes-dias").textContent = `${n} ${n === 1 ? "dia trabalhado" : "dias trabalhados"}`;
    $("mes-media").textContent = n ? `Média de ${fmt(tm / n)} por dia` : "";

    renderComparacao(tm);
    renderMeta(key, tm);
    renderLista(doMes);
    renderChart();
    renderNudge();
  }

  function renderComparacao(tm) {
    const pm = selM === 0 ? 11 : selM - 1, py = selM === 0 ? selY - 1 : selY;
    const anterior = sum(doMesDe(chaveMes(py, pm)));
    const el = $("compara");
    el.className = "compara";
    if (!anterior || !tm) { el.hidden = true; return; }
    el.hidden = false;
    const pct = Math.round((tm - anterior) / anterior * 100);
    if (pct > 0) { el.classList.add("sobe"); el.textContent = `▲ ${pct}% a mais que ${MESES_LONGO[pm]}`; }
    else if (pct < 0) { el.classList.add("desce"); el.textContent = `▼ ${Math.abs(pct)}% a menos que ${MESES_LONGO[pm]}`; }
    else el.textContent = `Igual a ${MESES_LONGO[pm]}`;
  }

  function renderMeta(key, tm) {
    const meta = Number(metas[key]) || 0;
    const box = $("meta");
    const formAberto = !$("meta-form").hidden;
    $("meta-editar").textContent = meta ? "Alterar" : "Definir meta";
    $("meta-editar").hidden = formAberto;
    $("meta-vazia").hidden = !!meta || formAberto;
    $("meta-progresso").hidden = !meta;
    $("meta-remover").hidden = !meta;
    box.classList.toggle("batida", meta > 0 && tm >= meta);
    if (!meta) return;
    const pct = Math.min(100, tm / meta * 100);
    $("meta-preench").style.width = pct + "%";
    $("meta-barra").setAttribute("aria-valuenow", String(Math.round(pct)));
    $("meta-valores").textContent = `${fmt(tm)} de ${fmt(meta)}`;
    $("meta-falta").textContent = tm >= meta ? "Meta batida!" : `Faltam ${fmt(meta - tm)}`;
  }

  function renderLista(doMes) {
    $("list-title").textContent = `Dias trabalhados em ${MESES_LONGO[selM]}`;
    $("list-count").textContent = doMes.length ? `${doMes.length} ${doMes.length === 1 ? "registro" : "registros"}` : "";
    const tbody = $("rows");
    tbody.replaceChildren();
    for (const e of doMes) {
      const tr = document.createElement("tr");
      if (carregou && !idsVistos.has(e.id)) tr.classList.add("novo");
      if (editandoId === e.id) tr.classList.add("editando");
      const [y, m, d] = e.data.split("-");
      const sem = new Date(+y, +m - 1, +d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
      tr.innerHTML = `<td class="num"></td><td><span class="pill"></span></td><td class="v valor num"></td><td class="v acoes"><button class="acao edit" type="button">Editar</button><button class="acao del" type="button">Excluir</button></td>`;
      tr.children[0].textContent = `${d}/${m} · ${sem}`;
      const pill = tr.children[1].firstChild;
      pill.className = "pill " + (e.funcao === "monitor" ? "monitor" : "recepcionista");
      pill.textContent = e.funcao === "monitor" ? "Monitor" : "Recepcionista";
      tr.children[2].textContent = fmt(e.valor);
      const del = tr.querySelector(".del");
      if (pendingDel === e.id) { del.textContent = "Confirmar?"; del.classList.add("confirm"); }
      del.addEventListener("click", () => onDelete(e.id));
      tr.querySelector(".edit").addEventListener("click", () => iniciarEdicao(e));
      tbody.appendChild(tr);
    }
    if (carregou) entries.forEach(e => idsVistos.add(e.id));
    $("empty").hidden = doMes.length > 0;
  }

  function renderChart() {
    const y = selY;
    $("chart-title").textContent = `Ganhos por mês em ${y}`;
    const data = MESES.map((_, i) => sum(doMesDe(chaveMes(y, i))));
    const max = Math.max(...data, 0);
    const step = niceStep(max / 4 || 100);
    const top = Math.max(step * 4, step * Math.ceil(max / step));
    const W = 640, H = 260, L = 56, R = 10, T = 22, B = 28;
    const cw = (W - L - R) / 12, bw = Math.min(30, cw * 0.6);
    const yv = v => T + (H - T - B) * (1 - v / top);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de ganhos por mês em ${y}">`;
    for (let v = 0; v <= top + 0.001; v += step) {
      s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yv(v)}" y2="${yv(v)}"/>`;
      s += `<text x="${L - 8}" y="${yv(v) + 4}" text-anchor="end">${compact(v)}</text>`;
    }
    data.forEach((d, i) => {
      const x = L + cw * i + (cw - bw) / 2;
      const sel = i === selM;
      s += `<g class="${sel ? "sel" : ""}" data-m="${i}">`;
      if (d) s += `<rect class="seg" x="${x}" y="${yv(d)}" width="${bw}" height="${yv(0) - yv(d)}" rx="3" fill="#c2417a" opacity="${sel ? 1 : .4}"/>`;
      if (sel && d) s += `<text class="val" x="${x + bw / 2}" y="${yv(d) - 6}" text-anchor="middle">${compact(d)}</text>`;
      s += `<text class="m" x="${L + cw * i + cw / 2}" y="${H - 8}" text-anchor="middle">${MESES[i]}</text>`;
      s += `<rect class="hit" x="${L + cw * i}" y="${T}" width="${cw}" height="${H - T}"><title>${MESES_LONGO[i]}: ${fmt(d)}</title></rect>`;
      s += `</g>`;
    });
    s += `</svg>`;
    const c = $("chart");
    c.innerHTML = s;
    // No celular o gráfico rola de lado: mostra o mês escolhido
    if (c.scrollWidth > c.clientWidth) {
      const escala = c.scrollWidth / W;
      c.scrollLeft = Math.max(0, (L + cw * selM + cw / 2) * escala - c.clientWidth / 2);
    }
    c.querySelectorAll("g[data-m]").forEach(g => g.addEventListener("click", () => { selM = +g.dataset.m; pendingDel = null; render(); }));
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function compact(v) {
    if (v >= 1000) return "R$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
    return "R$ " + Math.round(v).toLocaleString("pt-BR");
  }

  // Lembrete dentro do app: depois das 17h, se hoje ainda não tem registro
  function renderNudge() {
    const hoje = hojeISO();
    const mostrar = carregou && new Date().getHours() >= 17 && !entries.some(e => e.data === hoje)
      && lerLocal("nudge-fechado", "") !== hoje && !editandoId;
    $("nudge").hidden = !mostrar;
  }
  $("nudge-fechar").addEventListener("click", () => { gravarLocal("nudge-fechado", hojeISO()); $("nudge").hidden = true; });
  $("nudge-ir").addEventListener("click", () => {
    $("f-data").value = hojeISO();
    $("painel-form").scrollIntoView({ behavior: menosMovimento ? "auto" : "smooth", block: "center" });
    setTimeout(() => $("f-valor").focus(), 350);
  });

  // ================= NAVEGAÇÃO =================
  $("prev").addEventListener("click", () => { selM--; if (selM < 0) { selM = 11; selY--; } pendingDel = null; fecharMetaForm(); render(); });
  $("next").addEventListener("click", () => { selM++; if (selM > 11) { selM = 0; selY++; } pendingDel = null; fecharMetaForm(); render(); });

  // ================= FORMULÁRIO (adicionar / editar) =================
  $("f-data").value = hojeISO();

  function iniciarEdicao(e) {
    editandoId = e.id;
    pendingDel = null;
    $("f-data").value = e.data;
    $("f-valor").value = valorParaCampo(e.valor);
    (e.funcao === "monitor" ? $("f-mon") : $("f-rec")).checked = true;
    $("form-titulo").textContent = "Editar dia";
    $("f-btn").textContent = "Salvar alterações";
    $("f-cancelar").hidden = false;
    $("painel-form").classList.add("editando");
    msg("");
    render();
    $("painel-form").scrollIntoView({ behavior: menosMovimento ? "auto" : "smooth", block: "center" });
    setTimeout(() => $("f-valor").focus(), 350);
  }
  function cancelarEdicao() {
    editandoId = null;
    $("form-titulo").textContent = "Adicionar dia trabalhado";
    $("f-btn").textContent = "Salvar dia";
    $("f-cancelar").hidden = true;
    $("painel-form").classList.remove("editando");
    $("f-valor").value = "";
    $("f-data").value = hojeISO();
    msg("");
    render();
  }
  $("f-cancelar").addEventListener("click", cancelarEdicao);

  function erroFirebase(e, acao) {
    const code = e && e.code;
    if (code === "permission-denied") return `Sem permissão para ${acao}. Saia e entre de novo.`;
    if (code === "resource-exhausted") return "Limite de uso do dia atingido. Tente amanhã.";
    return `Não foi possível ${acao}. Verifique a conexão e tente de novo.`;
  }

  $("form").addEventListener("submit", ev => {
    ev.preventDefault();
    const data = $("f-data").value;
    const valor = parseValor($("f-valor").value);
    const funcao = document.querySelector('input[name="funcao"]:checked').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return msg("Escolha o dia em que você trabalhou.", true);
    if (!(valor > 0)) return msg("Digite quanto você recebeu, por exemplo 120,00.", true);
    if (valor >= 100000) return msg("Esse valor parece alto demais. Confira e tente de novo.", true);
    if (!colGanhos) return msg("Ainda conectando. Tente de novo em instantes.", true);

    const [y, m] = data.split("-");
    selY = +y; selM = +m - 1;
    const papel = funcao === "monitor" ? "monitor" : "recepcionista";

    // Não espera a confirmação do servidor: com o modo offline, a tela atualiza na hora
    if (editandoId) {
      colGanhos.doc(editandoId).update({ data, valor, funcao, editadoEm: new Date().toISOString() })
        .catch(e => toast(erroFirebase(e, "salvar a alteração"), true));
      toast(`Alteração salva: ${fmt(valor)} como ${papel}`);
      cancelarEdicao();
    } else {
      colGanhos.add({ data, valor, funcao, criadoEm: new Date().toISOString() })
        .catch(e => toast(erroFirebase(e, "salvar"), true));
      $("f-valor").value = "";
      msg("");
      toast(`Dia salvo: ${fmt(valor)} como ${papel}`);
      render();
    }
  });

  function onDelete(id) {
    if (pendingDel !== id) { pendingDel = id; render(); return; }
    pendingDel = null;
    if (editandoId === id) cancelarEdicao();
    colGanhos.doc(id).delete().catch(e => toast(erroFirebase(e, "excluir"), true));
    toast("Dia excluído");
  }

  // ================= META DO MÊS =================
  function fecharMetaForm() { $("meta-form").hidden = true; }
  $("meta-editar").addEventListener("click", () => {
    const meta = Number(metas[chaveMes(selY, selM)]) || 0;
    $("meta-valor").value = meta ? valorParaCampo(meta) : "";
    $("meta-form").hidden = false;
    render();
    $("meta-valor").focus();
  });
  $("meta-cancelar").addEventListener("click", () => { fecharMetaForm(); render(); });
  $("meta-form").addEventListener("submit", ev => {
    ev.preventDefault();
    const v = parseValor($("meta-valor").value);
    if (!(v > 0) || v >= 1000000) { toast("Digite o valor da meta, por exemplo 2.000,00", true); return; }
    const k = chaveMes(selY, selM);
    colMetas.doc(k).set({ valor: v, atualizadoEm: new Date().toISOString() }).catch(e => toast(erroFirebase(e, "salvar a meta"), true));
    fecharMetaForm();
    toast(`Meta de ${MESES_LONGO[selM]}: ${fmt(v)}`);
    render();
  });
  $("meta-remover").addEventListener("click", () => {
    colMetas.doc(chaveMes(selY, selM)).delete().catch(e => toast(erroFirebase(e, "remover a meta"), true));
    fecharMetaForm();
    toast("Meta removida");
  });

  // ================= LEMBRETE =================
  const fusoHorario = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  function horaLembrete() { return /^\d{2}:\d{2}$/.test($("lembrete-hora").value) ? $("lembrete-hora").value : "19:00"; }
  function carimbo(d, hhmm, somaMin) {
    const [h, mi] = hhmm.split(":").map(Number);
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi + (somaMin || 0));
    return `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
  }
  function atualizarLinkLembrete() {
    const hh = horaLembrete(), d = new Date();
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: "Registrar meus ganhos",
      details: "Abra o Meus Ganhos e registre o dia de hoje: " + location.origin,
      dates: `${carimbo(d, hh)}/${carimbo(d, hh, 10)}`,
      ctz: fusoHorario,
      recur: "RRULE:FREQ=DAILY"
    });
    $("lembrete-google").href = "https://calendar.google.com/calendar/render?" + p.toString();
  }
  $("lembrete-hora").value = lerLocal("lembrete-hora", "19:00");
  $("lembrete-hora").addEventListener("change", () => { gravarLocal("lembrete-hora", horaLembrete()); atualizarLinkLembrete(); });
  atualizarLinkLembrete();

  function baixar(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  $("lembrete-ics").addEventListener("click", () => {
    const hh = horaLembrete(), d = new Date();
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Meus Ganhos//PT-BR", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:lembrete-meus-ganhos-${Date.now()}@meusganhos`,
      `DTSTAMP:${carimbo(new Date(), `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`)}`,
      `DTSTART:${carimbo(d, hh)}`, `DTEND:${carimbo(d, hh, 10)}`,
      "RRULE:FREQ=DAILY",
      "SUMMARY:Registrar meus ganhos",
      `DESCRIPTION:Abra o Meus Ganhos e registre o dia de hoje: ${location.origin}`,
      `URL:${location.origin}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Registrar meus ganhos", "TRIGGER:PT0M", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n");
    baixar("lembrete-meus-ganhos.ics", ics, "text/calendar");
    toast("Abra o arquivo baixado para adicionar à agenda");
  });

  // ================= BACKUP =================
  const dataArquivo = () => hojeISO();
  $("baixar-planilha").addEventListener("click", () => {
    if (!entries.length) return toast("Ainda não há dias para baixar", true);
    const linhas = [["Data", "Dia da semana", "Função", "Valor (R$)"]];
    [...entries].sort((a, b) => a.data.localeCompare(b.data)).forEach(e => {
      const [y, m, d] = e.data.split("-");
      const sem = new Date(+y, +m - 1, +d).toLocaleDateString("pt-BR", { weekday: "long" });
      linhas.push([`${d}/${m}/${y}`, sem, e.funcao === "monitor" ? "Monitor" : "Recepcionista", valorParaCampo(e.valor)]);
    });
    linhas.push(["", "", "Total", valorParaCampo(sum(entries))]);
    const csv = "﻿" + linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    baixar(`meus-ganhos-${dataArquivo()}.csv`, csv, "text/csv;charset=utf-8");
    toast("Planilha baixada");
  });
  $("baixar-backup").addEventListener("click", () => {
    const dados = {
      app: "meus-ganhos", versao: 1, exportadoEm: new Date().toISOString(),
      ganhos: entries.map(({ id, data, valor, funcao, criadoEm, editadoEm }) => ({ id, data, valor, funcao, criadoEm, editadoEm })),
      metas
    };
    baixar(`backup-meus-ganhos-${dataArquivo()}.json`, JSON.stringify(dados, null, 2), "application/json");
    toast("Backup baixado. Guarde o arquivo em lugar seguro");
  });

  function validarGanho(g) {
    return g && typeof g.id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(g.id)
      && /^\d{4}-\d{2}-\d{2}$/.test(g.data) && typeof g.valor === "number" && g.valor > 0 && g.valor < 100000
      && (g.funcao === "recepcionista" || g.funcao === "monitor");
  }
  $("restaurar-arquivo").addEventListener("change", async ev => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    try {
      const dados = JSON.parse(await f.text());
      if (!dados || dados.app !== "meus-ganhos" || !Array.isArray(dados.ganhos)) throw new Error("formato");
      const ganhos = dados.ganhos.filter(validarGanho);
      const metasOk = Object.entries(dados.metas || {}).filter(([k, v]) => /^\d{4}-\d{2}$/.test(k) && typeof v === "number" && v > 0 && v < 1000000);
      if (!ganhos.length && !metasOk.length) throw new Error("vazio");
      const existentes = new Set(entries.map(e => e.id));
      const novos = ganhos.filter(g => !existentes.has(g.id)).length;
      backupPendente = { ganhos, metas: metasOk };
      $("restaurar-texto").textContent = `O arquivo tem ${ganhos.length} ${ganhos.length === 1 ? "dia" : "dias"} (${novos} ${novos === 1 ? "novo" : "novos"}) e ${metasOk.length} ${metasOk.length === 1 ? "meta" : "metas"}. Dias que já existem não são duplicados.`;
      $("restaurar-confirma").hidden = false;
    } catch (e) {
      toast("Esse arquivo não é um backup do Meus Ganhos", true);
    }
  });
  $("restaurar-cancelar").addEventListener("click", () => { backupPendente = null; $("restaurar-confirma").hidden = true; });
  $("restaurar-ok").addEventListener("click", async () => {
    if (!backupPendente || !colGanhos) return;
    const { ganhos, metas: ms } = backupPendente;
    backupPendente = null;
    $("restaurar-confirma").hidden = true;
    const db = firebase.firestore();
    const escritas = [
      ...ganhos.map(g => [colGanhos.doc(g.id), { data: g.data, valor: g.valor, funcao: g.funcao, criadoEm: g.criadoEm || new Date().toISOString() }]),
      ...ms.map(([k, v]) => [colMetas.doc(k), { valor: v, atualizadoEm: new Date().toISOString() }])
    ];
    try {
      for (let i = 0; i < escritas.length; i += 400) {
        const lote = db.batch();
        escritas.slice(i, i + 400).forEach(([ref, d]) => lote.set(ref, d));
        lote.commit().catch(e => toast(erroFirebase(e, "restaurar"), true));
      }
      toast("Backup restaurado");
    } catch (e) {
      toast(erroFirebase(e, "restaurar"), true);
    }
  });

  // ================= INSTALAR (PWA) =================
  let pedidoInstalacao = null;
  const instalado = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function renderInstalar() {
    const passos = $("instalar-passos");
    passos.replaceChildren();
    const podeBotao = !!pedidoInstalacao && !instalado();
    $("instalar").hidden = !podeBotao;
    $("instalar-2").hidden = !podeBotao;
    if (instalado()) {
      $("instalar-texto").textContent = "Você já está usando o Meus Ganhos como aplicativo.";
      return;
    }
    let lista = [];
    if (ehIOS) lista = ["Abra este site no Safari.", "Toque no botão Compartilhar (quadrado com seta para cima).", "Escolha “Adicionar à Tela de Início” e toque em Adicionar."];
    else if (!podeBotao) lista = ["Abra este site no Chrome do celular.", "Toque no menu ⋮ no canto de cima.", "Escolha “Instalar app” ou “Adicionar à tela inicial”."];
    lista.forEach(t => { const li = document.createElement("li"); li.textContent = t; passos.appendChild(li); });
  }
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); pedidoInstalacao = e; renderInstalar(); });
  window.addEventListener("appinstalled", () => { pedidoInstalacao = null; renderInstalar(); toast("App instalado na tela inicial"); });
  async function instalar() {
    if (!pedidoInstalacao) return;
    pedidoInstalacao.prompt();
    try { await pedidoInstalacao.userChoice; } catch (e) {}
    pedidoInstalacao = null;
    renderInstalar();
  }
  $("instalar").addEventListener("click", instalar);
  $("instalar-2").addEventListener("click", instalar);
  renderInstalar();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // ================= LOGIN E DADOS =================
  function mostrar(tela) {
    $("carregando").hidden = tela !== "carregando";
    $("boas-vindas").hidden = tela !== "entrada";
    $("painel").hidden = tela !== "painel";
  }

  function semLogin() {
    if (pararGanhos) { pararGanhos(); pararGanhos = null; }
    if (pararMetas) { pararMetas(); pararMetas = null; }
    colGanhos = colMetas = null;
    entries = []; metas = {}; carregou = false; idsVistos = new Set();
    pendingDel = null; editandoId = null;
    document.body.classList.remove("entrou");
    mostrar("entrada");
  }

  function comLogin(user) {
    const base = firebase.firestore().collection("usuarios").doc(user.uid);
    colGanhos = base.collection("ganhos");
    colMetas = base.collection("metas");
    const nome = user.displayName ? user.displayName.split(" ")[0] : "";
    $("titulo").textContent = nome ? `Olá, ${nome}!` : "Olá!";
    setStatus("Carregando seus ganhos…");
    mostrar("painel");
    document.body.classList.add("entrou");
    render();

    pararGanhos = colGanhos.onSnapshot({ includeMetadataChanges: true }, snap => {
      entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (snap.metadata.hasPendingWrites) setStatus(navigator.onLine ? "Salvando…" : "Sem internet · será enviado quando a conexão voltar", !navigator.onLine);
      else if (snap.metadata.fromCache) setStatus("Sem internet · mostrando o que já foi carregado", true);
      else setStatus("Tudo salvo na nuvem");
      const primeira = !carregou;
      if (primeira) { idsVistos = new Set(entries.map(e => e.id)); carregou = !snap.metadata.fromCache || entries.length > 0; }
      render();
    }, () => setStatus("Não foi possível carregar seus ganhos. Recarregue a página.", true));

    pararMetas = colMetas.onSnapshot(snap => {
      metas = {};
      snap.docs.forEach(d => { metas[d.id] = Number(d.data().valor) || 0; });
      render();
    }, () => {});
  }

  async function entrar() {
    $("bv-msg").textContent = "";
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await firebase.auth().signInWithPopup(provider);
    } catch (e) {
      const code = e && e.code;
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment" || code === "auth/cancelled-popup-request") {
        return firebase.auth().signInWithRedirect(provider);
      }
      if (code === "auth/popup-closed-by-user") return;
      $("bv-msg").textContent = code === "auth/unauthorized-domain"
        ? "Este endereço ainda não foi autorizado no Firebase (Authentication → Configurações → Domínios autorizados)."
        : code === "auth/network-request-failed"
          ? "Sem conexão com a internet. Conecte-se e tente de novo."
          : `Não foi possível entrar. Tente de novo. (código: ${code || "desconhecido"})`;
    }
  }

  function init() {
    if (!window.firebase || typeof firebaseConfig === "undefined") {
      mostrar("entrada");
      $("entrar").disabled = true;
      $("bv-msg").textContent = "Sem conexão com a internet. Conecte-se e abra o app de novo.";
      return;
    }
    firebase.initializeApp(firebaseConfig);
    // Guarda os dados no aparelho para funcionar sem internet
    firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {});
    $("entrar").addEventListener("click", entrar);
    $("sair").addEventListener("click", () => firebase.auth().signOut());
    firebase.auth().getRedirectResult().catch(e => { if (e && e.code) $("bv-msg").textContent = `Não foi possível entrar. (código: ${e.code})`; });
    firebase.auth().onAuthStateChanged(u => u ? comLogin(u) : semLogin());
    window.addEventListener("online", () => render());
  }
  init();
})();
