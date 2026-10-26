from flask import Flask, request, jsonify, render_template, send_file
import json
import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from collections import Counter
import qrcode
from io import BytesIO

app = Flask(__name__)

ARQUIVO = "fila.json"
HISTORICO = "historico.json"
MAP_TURMAS = "turmas_map.json"
SETORES = ["secretaria", "pedagogico", "estagio"]

NOMES_SETOR = {
    "secretaria": "Secretaria/Financeiro",
    "pedagogico": "Pedagógico",
    "estagio": "Estágio"
}

CURSOS = {
    "STB": ["STB", "SEGURANCADOTRABALHO", "SEGURANCA"],
    "ENF": ["ENF", "ENFERMAGEM"],
    "ADM": ["ADM", "ADMINISTRACAO"],
    "ELT": ["ELT", "ELETROTECNICA", "ELETRO"],
    "RAD": ["RAD", "RADIOLOGIA"],
    "CDI": ["CDI", "CUIDADORDEIDOSO", "CUIDADOR"],
    "ICR": ["ICR", "INSTRUMENTACAOCIRURGICA", "INSTRUMENTACAO"],
    "APH": ["APH", "ATENDIMENTOPREHOSPITALAR", "PREHOSPITALAR"],
    "CLT": ["CLT", "COLETADESANGUE", "COLETOR"],
    "BCV": ["BCV", "BOMBEIROCIVIL", "BOMBEIRO"]
}


def agora_br():
    return datetime.now(ZoneInfo("America/Sao_Paulo"))


def estado_inicial():
    return {
        "data": str(agora_br().date()),
        "setores": {s: {"numero": 0, "fila": []} for s in SETORES},
        "ultima_chamada": {"setor": None, "numero": None},
        "ultimas_por_setor": {s: None for s in SETORES},
        "contador_chamadas": 0
    }


def garantir_arquivos():
    if not os.path.exists(ARQUIVO):
        with open(ARQUIVO, "w", encoding="utf-8") as f:
            json.dump(estado_inicial(), f, indent=4, ensure_ascii=False)

    if not os.path.exists(HISTORICO):
        with open(HISTORICO, "w", encoding="utf-8") as f:
            json.dump([], f, indent=4, ensure_ascii=False)

    if not os.path.exists(MAP_TURMAS):
        with open(MAP_TURMAS, "w", encoding="utf-8") as f:
            json.dump({}, f, indent=4, ensure_ascii=False)


def carregar():
    with open(ARQUIVO, "r", encoding="utf-8") as f:
        dados = json.load(f)

    if ("contador_chamadas" not in dados
        or "ultimas_por_setor" not in dados
        or not isinstance(dados.get("ultima_chamada"), dict)
        or "setor" not in dados.get("ultima_chamada", {})):
        dados = estado_inicial()
        salvar(dados)
        return dados

    hoje = str(agora_br().date())
    if dados.get("data") != hoje:
        dados = estado_inicial()
        salvar(dados)

    return dados


def salvar(dados):
    with open(ARQUIVO, "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=4, ensure_ascii=False)


def carregar_historico():
    with open(HISTORICO, "r", encoding="utf-8") as f:
        return json.load(f)


def salvar_historico(lista):
    with open(HISTORICO, "w", encoding="utf-8") as f:
        json.dump(lista, f, indent=4, ensure_ascii=False)


def registrar_historico(pessoa):
    hist = carregar_historico()
    agora = agora_br()
    hist.append({
        "numero": pessoa["numero"],
        "nome": pessoa["nome"],
        "turma": pessoa["turma"],
        "setor": pessoa["setor"],
        "data": str(agora.date()),
        "hora": agora.strftime("%H:%M"),
        "timestamp": agora.isoformat()
    })
    salvar_historico(hist)


# ---------- NORMALIZAÇÃO DE TURMA ----------

def carregar_map_turmas():
    if not os.path.exists(MAP_TURMAS):
        return {}
    with open(MAP_TURMAS, "r", encoding="utf-8") as f:
        return json.load(f)


def salvar_map_turmas(mapa):
    with open(MAP_TURMAS, "w", encoding="utf-8") as f:
        json.dump(mapa, f, indent=4, ensure_ascii=False)


def limpar_texto(t):
    if not t:
        return ""
    t = t.upper().strip()
    acentos = {"Á": "A", "À": "A", "Ã": "A", "Â": "A", "É": "E", "Ê": "E",
               "Í": "I", "Ó": "O", "Ô": "O", "Õ": "O", "Ú": "U", "Ç": "C"}
    for k, v in acentos.items():
        t = t.replace(k, v)
    t = re.sub(r"[^A-Z0-9]", "", t)
    t = t.replace("L", "1").replace("I", "1").replace("O", "0")
    return t


def descobrir_curso(t):
    for sigla in sorted(CURSOS.keys(), key=lambda s: -max(len(v) for v in CURSOS[s])):
        for variacao in CURSOS[sigla]:
            if t.startswith(variacao):
                return sigla
    return None


def extrair_numero(t, sigla):
    variacoes = CURSOS[sigla]
    for v in sorted(variacoes, key=len, reverse=True):
        if t.startswith(v):
            resto = t[len(v):]
            nums = re.findall(r"\d+", resto)
            if nums:
                num = nums[0]
                if len(num) == 1:
                    num = "0" + num
                return num
    return None


def aprender_mapa(turma_original):
    t = limpar_texto(turma_original)
    sigla = descobrir_curso(t)
    if not sigla:
        return
    numero = extrair_numero(t, sigla)
    if not numero:
        return

    mapa = carregar_map_turmas()
    if sigla not in mapa:
        mapa[sigla] = []
    if numero not in mapa[sigla]:
        mapa[sigla].append(numero)
    salvar_map_turmas(mapa)


def buscar_curso_pelo_numero(numero):
    mapa = carregar_map_turmas()
    for sigla, numeros in mapa.items():
        if numero in numeros:
            return sigla
    return None


def normalizar_turma(turma_original):
    if not turma_original or not turma_original.strip():
        return "—"

    t = limpar_texto(turma_original)

    sigla = descobrir_curso(t)
    if sigla:
        numero = extrair_numero(t, sigla)
        if numero:
            return sigla + numero
        return sigla

    nums = re.findall(r"\d+", t)
    if nums:
        num = nums[0]
        if len(num) == 1:
            num = "0" + num
        sigla_aprendida = buscar_curso_pelo_numero(num)
        if sigla_aprendida:
            return sigla_aprendida + num

    return turma_original.strip()


# ---------- PÁGINAS ----------

@app.route("/")
def menu():
    return render_template("menu.html")


@app.route("/qr")
def qr():
    return render_template("qr.html", setores=SETORES, nomes=NOMES_SETOR)


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/relatorio")
def relatorio():
    return render_template("relatorio.html")


@app.route("/formulario/<setor>")
def formulario(setor):
    if setor not in SETORES:
        return "Setor inválido", 404
    return render_template("formulario.html", setor=setor, nome_setor=NOMES_SETOR[setor])


@app.route("/atendente/<setor>")
def atendente(setor):
    if setor not in SETORES:
        return "Setor inválido", 404
    return render_template("atendente.html", setor=setor, nome_setor=NOMES_SETOR[setor])


@app.route("/painel")
def painel():
    return render_template("painel.html")


# ---------- API ----------

@app.route("/gerar", methods=["POST"])
def gerar():
    dados = carregar()
    body = request.get_json()
    setor = body.get("setor")

    if setor not in SETORES:
        return jsonify({"erro": "setor inválido"}), 400

    turma = body.get("turma", "").strip()
    aprender_mapa(turma)

    dados["setores"][setor]["numero"] += 1
    num = dados["setores"][setor]["numero"]

    pessoa = {
        "numero": num,
        "nome": body.get("nome", "").strip(),
        "turma": turma,
        "setor": setor,
        "status": "esperando",
        "hora_entrada": agora_br().strftime("%H:%M")
    }

    dados["setores"][setor]["fila"].append(pessoa)
    salvar(dados)

    return jsonify(pessoa)


@app.route("/dados/<setor>")
def dados_setor(setor):
    dados = carregar()
    if setor not in SETORES:
        return jsonify([])
    fila = sorted(dados["setores"][setor]["fila"], key=lambda x: x["numero"])
    return jsonify(fila)


@app.route("/adicionar_manual/<setor>", methods=["POST"])
def adicionar_manual(setor):
    if setor not in SETORES:
        return jsonify({"erro": "setor inválido"}), 400

    dados = carregar()
    body = request.get_json()

    turma = body.get("turma", "").strip()
    aprender_mapa(turma)

    dados["setores"][setor]["numero"] += 1
    num = dados["setores"][setor]["numero"]

    pessoa = {
        "numero": num,
        "nome": body.get("nome", "").strip(),
        "turma": turma,
        "setor": setor,
        "status": "esperando",
        "hora_entrada": agora_br().strftime("%H:%M")
    }

    dados["setores"][setor]["fila"].append(pessoa)
    salvar(dados)

    return jsonify(pessoa)


@app.route("/chamar/<setor>/<int:numero>", methods=["POST"])
def chamar(setor, numero):
    dados = carregar()
    for p in dados["setores"][setor]["fila"]:
        if p["numero"] == numero:
            if p["status"] != "finalizado":
                p["status"] = "repetir"
            dados["ultima_chamada"] = {"setor": setor, "numero": numero}
            dados["ultimas_por_setor"][setor] = numero
            dados["contador_chamadas"] = dados.get("contador_chamadas", 0) + 1
            salvar(dados)
            return jsonify(p)
    return jsonify({"erro": "não encontrado"}), 404


@app.route("/rechamar/<setor>/<int:numero>", methods=["POST"])
def rechamar(setor, numero):
    dados = carregar()
    for p in dados["setores"][setor]["fila"]:
        if p["numero"] == numero:
            dados["ultima_chamada"] = {"setor": setor, "numero": numero}
            dados["ultimas_por_setor"][setor] = numero
            dados["contador_chamadas"] = dados.get("contador_chamadas", 0) + 1
            salvar(dados)
            return jsonify(p)
    return jsonify({"erro": "não encontrado"}), 404


@app.route("/finalizar/<setor>/<int:numero>", methods=["POST"])
def finalizar(setor, numero):
    dados = carregar()
    for p in dados["setores"][setor]["fila"]:
        if p["numero"] == numero:
            p["status"] = "finalizado"
            p["hora_fim"] = agora_br().strftime("%H:%M")
            salvar(dados)
            registrar_historico(p)
            return jsonify({"ok": True})
    return jsonify({"erro": "não encontrado"}), 404


@app.route("/aluno_status/<setor>/<int:numero>")
def aluno_status(setor, numero):
    dados = carregar()
    for p in dados["setores"][setor]["fila"]:
        if p["numero"] == numero:
            posicao = sum(
                1 for x in dados["setores"][setor]["fila"]
                if x["status"] == "esperando" and x["numero"] < numero
            )
            return jsonify({
                "numero": p["numero"],
                "nome": p["nome"],
                "turma": p["turma"],
                "setor": p["setor"],
                "status": p["status"],
                "posicao": posicao
            })
    return jsonify({"erro": "não encontrado"}), 404


@app.route("/painel_dados")
def painel_dados():
    dados = carregar()
    uc = dados.get("ultima_chamada") or {}

    atual = {"numero": 0, "nome": "", "turma": "", "setor": None}

    if uc.get("setor") and uc.get("numero"):
        for p in dados["setores"][uc["setor"]]["fila"]:
            if p["numero"] == uc["numero"]:
                atual = p
                break

    ultimos = {}
    for setor in SETORES:
        num = dados.get("ultimas_por_setor", {}).get(setor)

        if atual.get("setor") == setor and atual.get("numero") == num:
            anterior = None
            for p in dados["setores"][setor]["fila"]:
                if p["numero"] < num and p["status"] in ("repetir", "finalizado"):
                    if anterior is None or p["numero"] > anterior["numero"]:
                        anterior = p
            ultimos[setor] = [anterior] if anterior else []
        else:
            p = None
            if num:
                for x in dados["setores"][setor]["fila"]:
                    if x["numero"] == num:
                        p = x
                        break
            ultimos[setor] = [p] if p else []

    return jsonify({
        "atual": atual,
        "ultimos": ultimos,
        "contador": dados.get("contador_chamadas", 0)
    })


@app.route("/qrcode/<setor>")
def qrcode_img(setor):
    if setor not in SETORES:
        return "setor inválido", 404

    url = request.host_url.rstrip("/") + f"/formulario/{setor}"
    img = qrcode.make(url)

    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return send_file(buf, mimetype="image/png")


@app.route("/dashboard_dados")
def dashboard_dados():
    hist = carregar_historico()

    if not hist:
        return jsonify({
            "total": 0,
            "por_setor": {},
            "por_dia": {},
            "por_hora": {},
            "por_mes": {},
            "ultimos": []
        })

    return jsonify({
        "total": len(hist),
        "por_setor": dict(Counter(h["setor"] for h in hist)),
        "por_dia": dict(Counter(h["data"] for h in hist)),
        "por_hora": dict(Counter(h["hora"].split(":")[0] for h in hist)),
        "por_mes": dict(Counter(h["data"][:7] for h in hist)),
        "ultimos": hist[-20:][::-1]
    })


@app.route("/dashboard_mes/<mes>")
def dashboard_mes(mes):
    hist = carregar_historico()
    filtrado = [h for h in hist if h["data"].startswith(mes)]

    if not filtrado:
        return jsonify({"total": 0, "por_setor": {}, "por_dia": {}, "por_hora": {}, "registros": []})

    return jsonify({
        "total": len(filtrado),
        "por_setor": dict(Counter(h["setor"] for h in filtrado)),
        "por_dia": dict(Counter(h["data"] for h in filtrado)),
        "por_hora": dict(Counter(h["hora"].split(":")[0] for h in filtrado)),
        "registros": filtrado
    })


# ---------- RELATÓRIO ----------

@app.route("/relatorio_dados")
def relatorio_dados():
    data_ini = request.args.get("data_ini", "")
    data_fim = request.args.get("data_fim", "")
    agrupar = request.args.get("agrupar", "setor")

    hist = carregar_historico()

    filtrado = []
    for h in hist:
        if data_ini and h["data"] < data_ini:
            continue
        if data_fim and h["data"] > data_fim:
            continue
        filtrado.append(h)

    if not filtrado:
        return jsonify({
            "total": 0,
            "agrupamento": agrupar,
            "linhas": [],
            "registros": [],
            "por_setor": {},
            "por_turma": {},
            "pico": "—",
            "periodo": {"de": data_ini or "—", "ate": data_fim or "—"}
        })

    # Normaliza turma em todos os registros (só pra exibição)
    for h in filtrado:
        h["turma_original"] = h.get("turma", "")
        h["turma"] = normalizar_turma(h.get("turma", ""))

    # 🔥 MODO "TODOS" — AGORA CONSOLIDADO POR DATA/HORA/SETOR/TURMA
    if agrupar == "todos":
        chave_fn = lambda h: (
            h["data"],
            h["hora"].split(":")[0] + "h",
            h["setor"],
            h["turma"]
        )
        contagem = Counter(chave_fn(h) for h in filtrado)
        linhas = [
            {
                "data": k[0],
                "hora": k[1],
                "setor": k[2],
                "turma": k[3],
                "total": v
            }
            for k, v in contagem.items()
        ]
        # Ordena por: Data → Hora → Setor → Turma
        linhas.sort(key=lambda x: (x["data"], x["hora"], x["setor"], x["turma"]))

        pico = Counter(h["hora"].split(":")[0] for h in filtrado).most_common(1)

        return jsonify({
            "total": len(filtrado),
            "agrupamento": "todos",
            "linhas": linhas,
            "registros": [],
            "por_setor": dict(Counter(h["setor"] for h in filtrado)),
            "por_turma": dict(Counter(h["turma"] or "—" for h in filtrado)),
            "pico": pico[0][0] + ":00" if pico else "—",
            "periodo": {
                "de": data_ini or filtrado[0]["data"],
                "ate": data_fim or filtrado[-1]["data"]
            }
        })

    if agrupar == "dia":
        chave_fn = lambda h: h["data"]
    elif agrupar == "mes":
        chave_fn = lambda h: h["data"][:7]
    elif agrupar == "hora":
        chave_fn = lambda h: h["hora"].split(":")[0] + "h"
    elif agrupar == "turma":
        chave_fn = lambda h: h["turma"] or "—"
    else:
        chave_fn = lambda h: NOMES_SETOR.get(h["setor"], h["setor"])

    contagem = Counter(chave_fn(h) for h in filtrado)
    linhas = [{"chave": k, "total": v} for k, v in contagem.items()]
    linhas.sort(key=lambda x: x["chave"])

    pico = Counter(h["hora"].split(":")[0] for h in filtrado).most_common(1)

    return jsonify({
        "total": len(filtrado),
        "agrupamento": agrupar,
        "linhas": linhas,
        "registros": filtrado,
        "por_setor": dict(Counter(h["setor"] for h in filtrado)),
        "por_turma": dict(Counter(h["turma"] or "—" for h in filtrado)),
        "pico": pico[0][0] + ":00" if pico else "—",
        "periodo": {
            "de": data_ini or (filtrado[0]["data"] if filtrado else "—"),
            "ate": data_fim or (filtrado[-1]["data"] if filtrado else "—")
        }
    })


garantir_arquivos()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)