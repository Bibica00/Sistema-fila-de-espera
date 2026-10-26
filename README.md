# Grau — Sistema de Fila

Sistema de gerenciamento de filas para atendimento em setores (Secretaria, Pedagógico e Estágio).

## Funcionalidades

- Cadastro de alunos via formulário ou QR Code
- Painel TV com chamada por voz (Text-to-Speech)
- Tela do atendente com três colunas (Chamar, Rechamar, Finalizados)
- Dashboard com gráficos e estatísticas
- Relatório consolidado por período, setor, turma, dia, hora ou mês
- Histórico completo de atendimentos

## Tecnologias

- Python 3.10+
- Flask
- Chart.js
- qrcode

## Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/SEU_USUARIO/SEU_REPO.git
cd SEU_REPO

# 2. Crie e ative um ambiente virtual
python -m venv venv
source venv/bin/activate        # Linux/Mac
venv\Scripts\activate           # Windows

# 3. Instale as dependências
pip install flask qrcode[pil]

# 4. Rode o projeto
python app.py