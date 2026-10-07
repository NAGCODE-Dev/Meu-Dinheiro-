const STORAGE_KEY = "meu-dinheiro-v2";

const DEFAULT_DATA = {
  settings: {
    monthlyIncome: 1000,
    month: "",
    cdiRate: 14.90,
    budget: {
      necessidades: 20,
      comida: 25,
      patrimonio: 30,
      objetivos: 15,
      lazer: 10
    }
  },

  investments: [],

  transactions: []
};

let data = loadData();

const $ = id => document.getElementById(id);

const brl = value =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value) || 0);

const percent = value =>
  `${Number(value || 0).toFixed(2).replace(".", ",")}%`;

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!saved) {
      return structuredClone(DEFAULT_DATA);
    }

    return {
      ...structuredClone(DEFAULT_DATA),
      ...saved,
      settings: {
        ...structuredClone(DEFAULT_DATA.settings),
        ...(saved.settings || {}),
        budget: {
          ...structuredClone(DEFAULT_DATA.settings.budget),
          ...(saved.settings?.budget || {})
        }
      },
      investments: saved.investments || [],
      transactions: saved.transactions || []
    };
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function calculateMonthlyCdi() {
  const annual = Number(data.settings.cdiRate) || 0;

  /*
   * Aproximação da taxa mensal equivalente:
   *
   * (1 + taxa anual)^(1/12) - 1
   */
  return Math.pow(1 + annual / 100, 1 / 12) - 1;
}

function calculateInvestmentRate(investment) {
  if (investment.type === "monthly") {
    return Number(investment.rate) || 0;
  }

  const cdiMonthly = calculateMonthlyCdi();

  return cdiMonthly * (Number(investment.cdiPercent) || 0) / 100 * 100;
}

function calculateInvestmentReturn(investment) {
  const amount = Number(investment.amount) || 0;

  const monthlyRate = calculateInvestmentRate(investment);

  return amount * monthlyRate / 100;
}

function renderSummary() {
  const totalInvestido = data.investments.reduce(
    (sum, investment) => sum + Number(investment.amount || 0),
    0
  );

  const totalRendimento = data.investments.reduce(
    (sum, investment) => sum + calculateInvestmentReturn(investment),
    0
  );

  const entradas = data.transactions
    .filter(item => item.type === "entrada")
    .reduce((sum, item) => sum + Number(item.value || 0), 0);

  const saidas = data.transactions
    .filter(item => item.type === "saida")
    .reduce((sum, item) => sum + Number(item.value || 0), 0);

  $("totalInvestido").textContent = brl(totalInvestido);
  $("totalRendimento").textContent = brl(totalRendimento);

  /*
   * Patrimônio estimado = capital investido + rendimento mensal estimado.
   */
  $("patrimonio").textContent = brl(
    totalInvestido + totalRendimento
  );

  $("entradas").textContent = brl(entradas);
  $("saidas").textContent = brl(saidas);

  const goal = 7500;

  $("goalBar").style.width =
    Math.min(100, totalInvestido / goal * 100) + "%";
}

function renderIncome() {
  $("monthlyIncome").value = data.settings.monthlyIncome;

  if (data.settings.month) {
    $("monthReference").value = data.settings.month;
  }

  $("cdiRate").value = data.settings.cdiRate;

  const monthlyCdi = calculateMonthlyCdi() * 100;

  $("monthlyCdi").textContent = percent(monthlyCdi);

  document
    .querySelectorAll(".budget-percent")
    .forEach(input => {
      input.value =
        data.settings.budget[input.dataset.category] || 0;
    });

  renderBudget();
}

function renderBudget() {
  const income = Number(data.settings.monthlyIncome) || 0;

  const categories = {
    necessidades: "budgetNecessidades",
    comida: "budgetComida",
    patrimonio: "budgetPatrimonio",
    objetivos: "budgetObjetivos",
    lazer: "budgetLazer"
  };

  let totalPercent = 0;

  Object.entries(categories).forEach(([category, elementId]) => {
    const percentage =
      Number(data.settings.budget[category]) || 0;

    totalPercent += percentage;

    const value = income * percentage / 100;

    $(elementId).textContent = brl(value);
  });

  $("percentageTotal").textContent =
    `${totalPercent}%`;

  const warning = $("percentageWarning");

  if (Math.abs(totalPercent - 100) > 0.01) {
    warning.classList.remove("hidden");
  } else {
    warning.classList.add("hidden");
  }
}

function renderInvestments() {
  const container = $("investmentList");

  if (!data.investments.length) {
    container.innerHTML = `
      <div class="empty">
        Nenhum investimento cadastrado.
      </div>
    `;

    return;
  }

  container.innerHTML = data.investments.map((investment, index) => {
    const rate = calculateInvestmentRate(investment);
    const monthlyReturn = calculateInvestmentReturn(investment);

    let description;

    if (investment.type === "monthly") {
      description = `${percent(rate)} ao mês`;
    } else {
      description =
        `${investment.cdiPercent}% do CDI · ${percent(rate)} a.m. estimado`;
    }

    return `
      <div class="investment">

        <div class="investment-top">
          <div>
            <div class="investment-name">
              ${escapeHTML(investment.name)}
            </div>

            <div class="investment-meta">
              ${description}
            </div>
          </div>

          <strong>
            ${brl(investment.amount)}
          </strong>
        </div>

        <div class="investment-return">
          <span class="small">
            Rendimento mensal estimado
          </span>

          <strong class="positive">
            +${brl(monthlyReturn)}
          </strong>
        </div>

        <button
          class="danger"
          style="margin-top:10px;padding:6px 9px;font-size:11px"
          onclick="removeInvestment(${index})"
        >
          excluir
        </button>

      </div>
    `;
  }).join("");
}

function renderTransactions() {
  const container = $("transactionList");

  const transactions = [...data.transactions]
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!transactions.length) {
    container.className = "empty";
    container.innerHTML = "Nenhum lançamento ainda.";
    return;
  }

  container.className = "";

  container.innerHTML = transactions.map(transaction => {
    const originalIndex =
      data.transactions.indexOf(transaction);

    const positive =
      transaction.type === "entrada" ||
      transaction.type === "investimento";

    const signal =
      transaction.type === "saida" ? "−" : "+";

    const date = new Date(
      transaction.date + "T12:00:00"
    ).toLocaleDateString("pt-BR");

    return `
      <div class="row">

        <div>
          <strong>
            ${escapeHTML(
              transaction.note || transaction.category
            )}
          </strong>

          <div class="small">
            ${escapeHTML(transaction.category)} · ${date}
          </div>
        </div>

        <div style="text-align:right">

          <strong class="amount ${positive ? "pos" : "neg"}">
            ${signal}${brl(transaction.value)}
          </strong>

          <br>

          <button
            class="danger"
            style="padding:4px 7px;font-size:11px"
            onclick="removeTransaction(${originalIndex})"
          >
            excluir
          </button>

        </div>

      </div>
    `;
  }).join("");
}

function render() {
  renderSummary();
  renderIncome();
  renderInvestments();
  renderTransactions();
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   RENDA
========================= */

$("monthlyIncome").addEventListener("input", event => {
  data.settings.monthlyIncome =
    Number(event.target.value) || 0;

  saveData();
  renderBudget();
});

$("monthReference").addEventListener("change", event => {
  data.settings.month = event.target.value;

  saveData();
});

$("cdiRate").addEventListener("input", event => {
  data.settings.cdiRate =
    Number(event.target.value) || 0;

  saveData();

  $("monthlyCdi").textContent =
    percent(calculateMonthlyCdi() * 100);

  renderInvestments();
  renderSummary();
});

/* =========================
   DIVISÃO
========================= */

document
  .querySelectorAll(".budget-percent")
  .forEach(input => {

    input.addEventListener("input", event => {

      const category = event.target.dataset.category;

      data.settings.budget[category] =
        Number(event.target.value) || 0;

      saveData();

      renderBudget();
    });
  });

/* =========================
   TIPO DE INVESTIMENTO
========================= */

$("investmentType").addEventListener("change", event => {

  const isCdi = event.target.value === "cdi";

  $("monthlyRateField")
    .classList.toggle("hidden", isCdi);

  $("cdiPercentField")
    .classList.toggle("hidden", !isCdi);
});

/* =========================
   NOVO INVESTIMENTO
========================= */

$("investmentForm").addEventListener("submit", event => {

  event.preventDefault();

  const name =
    $("investmentName").value.trim();

  const amount =
    Number($("investmentAmount").value);

  const type =
    $("investmentType").value;

  if (!name || amount <= 0) {
    return;
  }

  const rate =
    type === "monthly"
      ? Number($("investmentRate").value) || 0
      : 0;

  const cdiPercent =
    type === "cdi"
      ? Number($("investmentCdiPercent").value) || 0
      : 0;

  /*
   * Procura um investimento existente com:
   * - mesmo nome
   * - mesmo tipo de rendimento
   * - mesma taxa
   *
   * Assim, novos aportes são somados ao investimento
   * em vez de criar vários registros separados.
   */
  const existing = data.investments.find(investment =>
    investment.name.toLowerCase() === name.toLowerCase() &&
    investment.type === type &&
    (
      type === "monthly"
        ? Number(investment.rate) === rate
        : Number(investment.cdiPercent) === cdiPercent
    )
  );

  if (existing) {

    existing.amount =
      Number(existing.amount) + amount;

  } else {

    data.investments.push({
      id: crypto.randomUUID(),
      name,
      amount,
      type,
      rate,
      cdiPercent
    });

  }

  saveData();

  event.target.reset();

  $("investmentType").value = "monthly";

  $("monthlyRateField")
    .classList.remove("hidden");

  $("cdiPercentField")
    .classList.add("hidden");

  render();
});
/* =========================
   LANÇAMENTOS
========================= */

$("transactionDate").value =
  new Date().toISOString().slice(0, 10);

$("transactionForm").addEventListener("submit", event => {

  event.preventDefault();

  const value =
    Number($("transactionValue").value);

  if (value <= 0) {
    return;
  }

  data.transactions.push({
    id: crypto.randomUUID(),

    type:
      $("transactionType").value,

    value,

    category:
      $("transactionCategory").value,

    date:
      $("transactionDate").value,

    note:
      $("transactionNote").value.trim()
  });

  saveData();

  event.target.reset();

  $("transactionDate").value =
    new Date().toISOString().slice(0, 10);

  render();
});

function removeTransaction(index) {

  if (!confirm("Excluir este lançamento?")) {
    return;
  }

  data.transactions.splice(index, 1);

  saveData();

  render();
}

/* =========================
   LIMPAR TUDO
========================= */

$("clearData").addEventListener("click", () => {

  if (!confirm(
    "Isso apagará renda, investimentos e histórico. Continuar?"
  )) {
    return;
  }

  data = structuredClone(DEFAULT_DATA);

  saveData();

  $("transactionDate").value =
    new Date().toISOString().slice(0, 10);

  render();
});

/* =========================
   SERVICE WORKER
========================= */

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js")
    .catch(error => {
      console.error(
        "Falha ao registrar Service Worker:",
        error
      );
    });
}

/* =========================
   INICIALIZAÇÃO
========================= */

render();