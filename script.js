const SETORES = {
    secretaria: "Secretaria/Financeiro",
    pedagogico: "Pedagógico",
    estagio: "Estágio"
};

const pad = n => (n < 10 ? "0" + n : "" + n);

function buzz(p) {
    if (navigator.vibrate) navigator.vibrate(p);
}

/* ---------- ALUNO ---------- */

if (document.body.dataset.pagina === "formulario") {

    const setor = document.body.dataset.setor;
    let senha = null;
    let avisou = false;

    window.enviar = function () {
        const nome = document.getElementById("nome").value.trim();
        const turma = document.getElementById("turma").value.trim();

        if (!nome || !turma) return alert("Preencha todos os campos.");

        fetch("/gerar", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ nome, turma, setor })
        })
        .then(r => r.json())
        .then(d => {
            senha = d.numero;
            document.getElementById("etapa-form").style.display = "none";
            document.getElementById("etapa-senha").style.display = "block";
            document.getElementById("numeroSenha").innerText = pad(d.numero);
            consultar();
            setInterval(consultar, 3000);
        })
        .catch(() => alert("Erro ao entrar na fila."));
    };

    function consultar() {
        if (senha === null) return;

        fetch(`/aluno_status/${setor}/${senha}`)
        .then(r => r.json())
        .then(d => {
            const circ = document.getElementById("circulo");
            const aviso = document.getElementById("aviso");
            const pos = document.getElementById("posicao");

            if (d.status === "repetir" || d.status === "finalizado") {
                circ.classList.add("chamado");
                aviso.innerText = "🔔 SEU NÚMERO ESTÁ SENDO CHAMADO";
                pos.innerText = "";

                if (!avisou) {
                    avisou = true;
                    buzz([500, 200, 500, 200, 500]);
                }
            } else {
                circ.classList.remove("chamado");
                aviso.innerText = "";
                avisou = false;

                if (d.posicao === 0) pos.innerText = "Você é o próximo";
                else if (d.posicao === 1) pos.innerText = "1 pessoa à sua frente";
                else pos.innerText = d.posicao + " pessoas à sua frente";
            }
        })
        .catch(() => {});
    }
}

/* ---------- ATENDENTE ---------- */

if (document.body.dataset.pagina === "atendente") {

    const setor = document.body.dataset.setor;
    let selecionado = null;

    document.querySelector(".atendente-header .setor").innerText = SETORES[setor];

    function montarFicha(p, coluna) {
        const div = document.createElement("div");
        div.className = "ficha";
        if (selecionado && selecionado.numero === p.numero) div.classList.add("selecionado");

        let botoes = "";
        if (coluna === "espera") {
            botoes = `<button class="btn-primario" onclick="event.stopPropagation();chamar(${p.numero})">Chamar</button>`;
        } else if (coluna === "repetir") {
            botoes = `<button class="btn-amarelo" onclick="event.stopPropagation();rechamar(${p.numero})">Rechamar</button>
                      <button class="btn-primario" onclick="event.stopPropagation();finalizar(${p.numero})">Finalizar</button>`;
        }

        div.innerHTML = `
            <div class="num">${pad(p.numero)}</div>
            <div class="dados">
                <div class="nome">${p.nome}</div>
                <div class="turma">${p.turma}</div>
            </div>
            <div class="acoes">${botoes}</div>
        `;

        div.onclick = () => {
            document.querySelectorAll(".ficha").forEach(f => f.classList.remove("selecionado"));
            div.classList.add("selecionado");
            selecionado = p;
        };

        return div;
    }

    function carregar() {
        fetch("/dados/" + setor)
        .then(r => r.json())
        .then(lista => {
            const esp = document.getElementById("lista-espera");
            const rep = document.getElementById("lista-repetir");
            const fin = document.getElementById("lista-finalizados");

            esp.innerHTML = rep.innerHTML = fin.innerHTML = "";

            let nEsp = 0, nRep = 0, nFin = 0;

            lista.forEach(p => {
                if (p.status === "esperando") { esp.appendChild(montarFicha(p, "espera")); nEsp++; }
                else if (p.status === "repetir") { rep.appendChild(montarFicha(p, "repetir")); nRep++; }
                else if (p.status === "finalizado") { fin.appendChild(montarFicha(p, "finalizado")); nFin++; }
            });

            const t = document.querySelectorAll(".coluna h2");
            t[0].innerHTML = `Chamar Próximo <span class="contador">${nEsp}</span>`;
            t[1].innerHTML = `Chamar Novamente <span class="contador">${nRep}</span>`;
            t[2].innerHTML = `Finalizados <span class="contador">${nFin}</span>`;
        });
    }

    window.chamar = n => fetch(`/chamar/${setor}/${n}`, {method:"POST"}).then(carregar);
    window.rechamar = n => fetch(`/rechamar/${setor}/${n}`, {method:"POST"}).then(carregar);

    window.finalizar = n => fetch(`/finalizar/${setor}/${n}`, {method:"POST"}).then(() => {
        selecionado = null;
        carregar();
    });

    window.abrirManual = () => {
        document.getElementById("modal-manual").style.display = "flex";
        document.getElementById("manual-nome").focus();
    };

    window.fecharManual = () => {
        document.getElementById("modal-manual").style.display = "none";
        document.getElementById("manual-nome").value = "";
        document.getElementById("manual-turma").value = "";
    };

    window.confirmarManual = () => {
        const nome = document.getElementById("manual-nome").value.trim();
        const turma = document.getElementById("manual-turma").value.trim();

        if (!nome || !turma) return alert("Preencha todos os campos.");

        fetch(`/adicionar_manual/${setor}`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ nome, turma })
        })
        .then(() => { fecharManual(); carregar(); });
    };

    carregar();
    setInterval(carregar, 2500);
}

/* ---------- PAINEL TV ---------- */

if (document.body.dataset.pagina === "painel") {

    let ultimoContador = null;
    let audioLiberado = false;

    function liberarAudio() {
        if (audioLiberado) return;
        audioLiberado = true;

        if (window.speechSynthesis) {
            const t = new SpeechSynthesisUtterance("");
            t.volume = 0;
            speechSynthesis.speak(t);
            speechSynthesis.getVoices();
        }

        const aviso = document.createElement("div");
        aviso.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: #FEC906; color: #176E0E; padding: 10px 22px;
            border-radius: 999px; font-weight: 700; font-size: 13px;
            z-index: 999; box-shadow: 0 4px 14px rgba(0,0,0,0.25);
        `;
        aviso.innerText = "✅ Som ativado!";
        document.body.appendChild(aviso);
        setTimeout(() => aviso.remove(), 2200);

        document.removeEventListener("click", liberarAudio);
        document.removeEventListener("keydown", liberarAudio);
        document.removeEventListener("touchstart", liberarAudio);
    }

    document.addEventListener("click", liberarAudio);
    document.addEventListener("keydown", liberarAudio);
    document.addEventListener("touchstart", liberarAudio);

    if (window.speechSynthesis) {
        const t = new SpeechSynthesisUtterance("");
        t.volume = 0;
        speechSynthesis.speak(t);
    }

    function falar(setor, numero) {
        if (!window.speechSynthesis) {
            console.warn("Navegador não suporta speechSynthesis");
            return;
        }

        speechSynthesis.cancel();

        const nomeSetor = SETORES[setor] || "";
        const texto = `${nomeSetor} ${pad(numero)}`;

        const f = new SpeechSynthesisUtterance(texto);
        f.lang = "pt-BR";
        f.rate = 0.85;
        f.pitch = 1;
        f.volume = 1;

        const vozes = speechSynthesis.getVoices();
        const vozPT = vozes.find(v => v.lang && v.lang.startsWith("pt"));
        if (vozPT) f.voice = vozPT;

        speechSynthesis.speak(f);
        console.log("🔊 Falando:", texto);
    }

    if (window.speechSynthesis) {
        speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
        speechSynthesis.getVoices();
    }

    function desenhar(d) {
        const atual = d.atual || {};
        const setorEl = document.getElementById("tv-setor-atual");
        const numEl = document.getElementById("tv-numero-atual");
        const nomeEl = document.getElementById("tv-nome-atual");
        const turmaEl = document.getElementById("tv-turma-atual");

        if (atual.numero && atual.numero > 0) {
            setorEl.innerText = SETORES[atual.setor] || "";
            numEl.innerText = pad(atual.numero);
            nomeEl.innerText = atual.nome || "---";
            turmaEl.innerText = atual.turma || "---";
        } else {
            setorEl.innerText = "AGUARDANDO";
            numEl.innerText = "00";
            nomeEl.innerText = "---";
            turmaEl.innerText = "---";
        }

        const cont = d.contador || 0;
        if (ultimoContador !== null && cont !== ultimoContador && atual.numero > 0) {
            falar(atual.setor, atual.numero);
            numEl.classList.add("piscando");
            setTimeout(() => numEl.classList.remove("piscando"), 2500);
        }
        ultimoContador = cont;

        const outros = ["secretaria", "pedagogico", "estagio"].filter(s => s !== atual.setor);

        const montarMedio = setor => {
            const lista = (d.ultimos && d.ultimos[setor]) || [];
            const p = lista[0];
            return `
                <div class="setor">${SETORES[setor]}</div>
                <div class="numero">${p ? pad(p.numero) : "--"}</div>
            `;
        };

        document.getElementById("tv-medio-1").innerHTML = montarMedio(outros[0]);
        document.getElementById("tv-medio-2").innerHTML = montarMedio(outros[1]);

        let html = "";
        ["secretaria", "pedagogico", "estagio"].forEach(s => {
            const p = (d.ultimos && d.ultimos[s] && d.ultimos[s][0]) || null;
            html += `
                <div class="item">
                    <div class="setor">${SETORES[s]}</div>
                    <div class="numero">${p ? pad(p.numero) : "--"}</div>
                </div>
            `;
        });
        document.getElementById("tv-ultimos").innerHTML = html;
    }

    function buscar() {
        fetch("/painel_dados")
        .then(r => r.json())
        .then(desenhar)
        .catch(() => {});
    }

    buscar();
    setInterval(buscar, 2500);
}

/* ---------- DASHBOARD ---------- */

if (document.body.dataset.pagina === "dashboard") {

    const graficos = {};

    function montar(id, tipo, labels, data, cor) {
        if (graficos[id]) graficos[id].destroy();

        const cfg = {
            type: tipo,
            data: {
                labels,
                datasets: [{
                    label: "Atendimentos",
                    data,
                    borderColor: "#176E0E",
                    backgroundColor: tipo === "line" ? "rgba(114,178,44,0.15)" : "#72B22C",
                    borderWidth: 3,
                    tension: 0.35,
                    fill: tipo === "line",
                    pointBackgroundColor: "#72B22C",
                    pointBorderColor: "#176E0E",
                    pointBorderWidth: 2,
                    pointRadius: tipo === "line" ? 5 : 0,
                    borderRadius: tipo === "bar" ? 8 : 0
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        };

        if (Array.isArray(cor) && tipo === "bar") {
            cfg.data.datasets[0].backgroundColor = cor;
        }

        graficos[id] = new Chart(document.getElementById(id), cfg);
    }

    function dataBR(iso) {
        if (!iso) return "---";
        const [a, m, d] = iso.split("-");
        return `${d}/${m}/${a}`;
    }

    function render(d) {
        document.getElementById("dash-total").innerText = d.total || 0;

        const setorTop = Object.entries(d.por_setor || {}).sort((a,b) => b[1]-a[1])[0];
        document.getElementById("dash-setor-top").innerText = setorTop ? SETORES[setorTop[0]] : "---";

        const horaTop = Object.entries(d.por_hora || {}).sort((a,b) => b[1]-a[1])[0];
        document.getElementById("dash-hora-top").innerText = horaTop ? horaTop[0] + ":00" : "--:00";

        const diaTop = Object.entries(d.por_dia || {}).sort((a,b) => b[1]-a[1])[0];
        document.getElementById("dash-dia-top").innerText = diaTop ? dataBR(diaTop[0]) : "---";

        const meses = Object.keys(d.por_mes || {}).sort();
        montar("grafico-meses", "line", meses, meses.map(m => d.por_mes[m]));

        const setL = Object.keys(d.por_setor || {}).map(s => SETORES[s]);
        montar("grafico-setor", "bar", setL, Object.values(d.por_setor || {}),
            ["#176E0E", "#72B22C", "#FEC906"]);

        const horas = Object.keys(d.por_hora || {}).sort();
        montar("grafico-hora", "bar", horas.map(h => h + "h"), horas.map(h => d.por_hora[h]));

        const dias = Object.keys(d.por_dia || {}).sort();
        montar("grafico-dia", "line", dias.map(dataBR), dias.map(x => d.por_dia[x]));

        const corpo = document.getElementById("dash-tabela-corpo");
        const ult = d.ultimos || [];

        corpo.innerHTML = ult.length
            ? ult.map(h => `
                <tr>
                    <td><strong>${pad(h.numero)}</strong></td>
                    <td>${h.nome}</td>
                    <td>${h.turma}</td>
                    <td>${SETORES[h.setor] || h.setor}</td>
                    <td>${dataBR(h.data)}</td>
                    <td>${h.hora}</td>
                </tr>`).join("")
            : `<tr><td colspan="6" style="text-align:center;color:#888;">Sem atendimentos ainda</td></tr>`;
    }

    window.aplicarFiltro = () => {
        const mes = document.getElementById("filtro-mes").value;
        if (!mes) return alert("Escolha um mês.");

        fetch("/dashboard_mes/" + mes)
        .then(r => r.json())
        .then(d => render({
            total: d.total,
            por_setor: d.por_setor,
            por_hora: d.por_hora,
            por_dia: d.por_dia,
            por_mes: {},
            ultimos: d.registros ? d.registros.slice(-20).reverse() : []
        }));
    };

    window.limparFiltro = () => {
        document.getElementById("filtro-mes").value = "";
        carregar();
    };

    function carregar() {
        fetch("/dashboard_dados")
        .then(r => r.json())
        .then(render)
        .catch(() => {});
    }

    carregar();
    setInterval(carregar, 10000);
}

/* ---------- RELATÓRIO ---------- */

if (document.body.dataset.pagina === "relatorio") {

    let graficoRel = null;

    const TITULOS = {
        setor: "Setor",
        dia: "Dia",
        mes: "Mês",
        hora: "Hora",
        turma: "Turma"
    };

    function dataBR(iso) {
        if (!iso) return "—";
        const [a, m, d] = iso.split("-");
        return `${d}/${m}/${a}`;
    }

    function formatarChave(chave, agrupar) {
        if (agrupar === "dia") return dataBR(chave);
        if (agrupar === "mes") {
            const [a, m] = chave.split("-");
            return `${m}/${a}`;
        }
        if (agrupar === "setor") return SETORES[chave] || chave;
        return chave;
    }

    window.gerarRelatorio = function () {
        const di = document.getElementById("data-ini").value;
        const df = document.getElementById("data-fim").value;
        const agr = document.getElementById("agrupar").value;

        fetch(`/relatorio_dados?data_ini=${di}&data_fim=${df}&agrupar=${agr}`)
        .then(r => r.json())
        .then(d => {

            if (d.total === 0) {
                document.getElementById("rel-resultado").style.display = "none";
                document.getElementById("rel-vazio").style.display = "block";
                document.getElementById("rel-vazio").innerHTML =
                    "Nenhum atendimento encontrado nesse período.";
                return;
            }

            document.getElementById("rel-vazio").style.display = "none";
            document.getElementById("rel-resultado").style.display = "block";

            document.getElementById("rel-total").innerText = d.total;
            document.getElementById("rel-pico").innerText = d.pico || "—:00";
            document.getElementById("rel-periodo").innerText =
                dataBR(d.periodo.de) + " → " + dataBR(d.periodo.ate);

            const thead = document.getElementById("rel-thead");
            const corpo = document.getElementById("rel-tbody");
            const titulo = document.getElementById("rel-titulo-tabela");

            // 🔥 MODO "TODOS" — CONSOLIDADO POR DATA/HORA/SETOR/TURMA
            if (agr === "todos") {
                titulo.innerText = "Consolidado por Data, Hora, Setor e Turma";
                thead.innerHTML = `
                    <tr>
                        <th>Data</th>
                        <th>Hora</th>
                        <th>Setor</th>
                        <th>Turma</th>
                        <th>Atendimentos</th>
                    </tr>
                `;

                const linhas = d.linhas || [];
                corpo.innerHTML = linhas.length
                    ? linhas.map(l => `
                        <tr>
                            <td>${dataBR(l.data)}</td>
                            <td><strong>${l.hora}</strong></td>
                            <td>${SETORES[l.setor] || l.setor}</td>
                            <td><strong>${l.turma}</strong></td>
                            <td>${l.total}</td>
                        </tr>
                    `).join("")
                    : `<tr><td colspan="5" style="text-align:center;color:#888;">Sem atendimentos</td></tr>`;
            }
            // MODOS AGRUPADOS
            else {
                titulo.innerText = "Consolidado por " + TITULOS[agr];
                thead.innerHTML = `
                    <tr>
                        <th>${TITULOS[agr]}</th>
                        <th>Atendimentos</th>
                        <th>% do Total</th>
                    </tr>
                `;
                corpo.innerHTML = d.linhas.map(l => {
                    const pct = ((l.total / d.total) * 100).toFixed(1);
                    return `
                        <tr>
                            <td><strong>${formatarChave(l.chave, agr)}</strong></td>
                            <td>${l.total}</td>
                            <td>${pct}%</td>
                        </tr>
                    `;
                }).join("");
            }

            // GRÁFICO
            const setLabels = Object.keys(d.por_setor || {}).map(s => SETORES[s] || s);
            const setValues = Object.values(d.por_setor || {});

            if (graficoRel) graficoRel.destroy();

            graficoRel = new Chart(document.getElementById("rel-grafico-setor"), {
                type: "doughnut",
                data: {
                    labels: setLabels,
                    datasets: [{
                        data: setValues,
                        backgroundColor: ["#176E0E", "#72B22C", "#FEC906"],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: "bottom", labels: { font: { family: "Poppins" }, boxWidth: 12 } }
                    },
                    cutout: "60%"
                }
            });
        })
        .catch(() => alert("Erro ao gerar relatório."));
    };

    window.limparRelatorio = function () {
        document.getElementById("data-ini").value = "";
        document.getElementById("data-fim").value = "";
        document.getElementById("agrupar").value = "setor";
        document.getElementById("rel-resultado").style.display = "none";
        document.getElementById("rel-vazio").style.display = "block";
        document.getElementById("rel-vazio").innerHTML =
            'Nenhum relatório gerado ainda. Configure os filtros acima e clique em <strong>Gerar Relatório</strong>.';
        if (graficoRel) { graficoRel.destroy(); graficoRel = null; }
    };

    window.imprimirRelatorio = function () {
        if (document.getElementById("rel-resultado").style.display === "none") {
            alert("Gere o relatório primeiro.");
            return;
        }
        window.print();
    };
}

/* ---------- RODAPÉ NO MENU ---------- */

if (!document.body.dataset.pagina && document.querySelector(".menu-grid")) {
    const rodape = document.createElement("footer");
    rodape.className = "rodape-creditos";
    rodape.innerHTML = `Criadora <strong>Gabrielli Rodrigues Previ</strong> &copy; 2026`;
    document.body.appendChild(rodape);
}