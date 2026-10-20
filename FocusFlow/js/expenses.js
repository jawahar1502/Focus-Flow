/* ==========================================================================
   FocusFlow — expenses.js
   Personal expense & budget tracker (₹). Amounts are validated, stored as
   numbers rounded to paise. This is bookkeeping, not financial advice.
   ========================================================================== */
(function () {
  'use strict';
  const FF = window.FF;
  const { el, clear, util } = FF;
  const store = FF.store;

  const EXP_CATS = [
    { value: 'food', label: 'Food & drinks', accent: 'flame' }, { value: 'transport', label: 'Transport', accent: 'blue' },
    { value: 'study', label: 'Books & study', accent: 'arc' }, { value: 'bills', label: 'Rent & bills', accent: 'red' },
    { value: 'fun', label: 'Entertainment', accent: 'violet' }, { value: 'shopping', label: 'Shopping', accent: 'gold' },
    { value: 'health', label: 'Health', accent: 'teal' }, { value: 'other', label: 'Other', accent: 'armor' }
  ];
  const INC_CATS = [
    { value: 'allowance', label: 'Allowance', accent: 'green' }, { value: 'stipend', label: 'Stipend / salary', accent: 'teal' },
    { value: 'freelance', label: 'Freelance', accent: 'cyan' }, { value: 'gift', label: 'Gift', accent: 'gold' }, { value: 'other-in', label: 'Other income', accent: 'armor' }
  ];
  const METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Other'].map((m) => ({ value: m, label: m }));
  const catOf = (t) => [...EXP_CATS, ...INC_CATS].find((c) => c.value === t.category) || EXP_CATS[EXP_CATS.length - 1];
  const MAX_AMOUNT = 1e9;

  const ui = { month: util.monthKey(util.today()), q: '', type: '', cat: '', method: '' };
  const load = () => store.get('transactions');
  const budget = () => Number((store.get('budget') || {}).monthly) || 0;
  const round2 = (n) => Math.round(n * 100) / 100;

  function summary(month) {
    const list = load().filter((t) => t.date.startsWith(month));
    const income = util.sum(list.filter((t) => t.type === 'income'), (t) => t.amount);
    const expense = util.sum(list.filter((t) => t.type === 'expense'), (t) => t.amount);
    const byCat = EXP_CATS.map((c) => ({ ...c, total: round2(util.sum(list.filter((t) => t.type === 'expense' && t.category === c.value), (t) => t.amount)) })).filter((c) => c.total > 0);
    return { list, income: round2(income), expense: round2(expense), balance: round2(income - expense), byCat, budget: budget() };
  }

  /* ---------------------------------------------------------------- Forms */
  async function openForm(txn, type) {
    const editing = !!txn;
    let kind = txn ? txn.type : type || 'expense';
    const res = await FF.ui.formModal({
      title: editing ? 'Edit transaction' : kind === 'income' ? 'Add income' : 'Add expense', submitText: editing ? 'Save changes' : 'Add transaction',
      fields: [
        { name: 'type', label: 'Type', type: 'select', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }] },
        { name: 'amount', label: 'Amount (₹)', type: 'number', required: true, min: 0.01, max: MAX_AMOUNT, step: '0.01', inputmode: 'decimal' },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'category', label: 'Category', type: 'select', options: [...EXP_CATS.map((c) => ({ value: c.value, label: 'Expense · ' + c.label })), ...INC_CATS.map((c) => ({ value: c.value, label: 'Income · ' + c.label }))] },
        { name: 'method', label: 'Payment method', type: 'select', options: METHODS },
        { name: 'description', label: 'Description', type: 'text', maxLength: 120, span2: true }
      ],
      values: txn ? { ...txn } : { type: kind, date: util.today(), category: kind === 'income' ? 'allowance' : 'food', method: 'UPI' },
      validate(v) {
        const errs = {};
        if (!(v.amount > 0)) errs.amount = 'Enter an amount greater than zero.';
        else if (Math.abs(v.amount * 100 - Math.round(v.amount * 100)) > 1e-6) errs.amount = 'Use at most two decimal places.';
        const isInc = INC_CATS.some((c) => c.value === v.category);
        if (v.type === 'income' && !isInc) errs.category = 'Pick an income category for income.';
        if (v.type === 'expense' && isInc) errs.category = 'Pick an expense category for an expense.';
        return errs;
      }
    });
    if (!res) return;
    const now = new Date().toISOString();
    const t = Object.assign(txn ? { ...txn } : { id: util.uid('txn'), createdAt: now }, {
      type: res.type, amount: round2(res.amount), date: res.date, category: res.category, method: res.method, description: res.description, updatedAt: now
    });
    store.upsert('transactions', t);
    FF.activity.log((t.type === 'income' ? 'Recorded income ' : 'Recorded expense ') + util.money(t.amount), t.type === 'income' ? 'green' : 'gold');
    FF.ui.toast(editing ? 'Transaction updated.' : 'Transaction added.', 'success');
    if (t.date.slice(0, 7) !== ui.month) { ui.month = t.date.slice(0, 7); }
  }

  async function setBudget() {
    const res = await FF.ui.formModal({
      title: 'Monthly budget', submitText: 'Save budget', intro: 'The budget applies to every month. Set 0 to remove it.',
      fields: [{ name: 'monthly', label: 'Monthly spending budget (₹)', type: 'number', required: true, min: 0, max: MAX_AMOUNT, step: '0.01' }],
      values: { monthly: budget() || '' }
    });
    if (res) { store.set('budget', { monthly: round2(res.monthly) }); FF.ui.toast('Budget saved.', 'success'); }
  }

  async function remove(t) {
    const ok = await FF.ui.confirm({ title: 'Delete transaction?', message: (t.type === 'income' ? 'Income of ' : 'Expense of ') + util.money(t.amount) + ' on ' + util.formatDate(t.date, 'long') + ' will be deleted.', confirmText: 'Delete', danger: true });
    if (ok) { store.remove('transactions', t.id); FF.ui.toast('Transaction deleted.', 'info'); }
  }

  /* ----------------------------------------------------------------- View */
  function render(root, ctx) {
    const cards = el('div', { class: 'stat-grid' });
    const budgetBox = el('div', { class: 'card', 'data-accent': 'armor' });
    const catBox = el('div', { class: 'card', 'data-accent': 'blue' });
    const histBox = el('div', { class: 'card', 'data-accent': 'arc' });
    const listBox = el('ul', { class: 'txn-list' });
    const count = el('p', { class: 'muted small', 'aria-live': 'polite' });
    const monthLabel = el('strong', { 'aria-live': 'polite' });

    const search = el('input', { type: 'search', placeholder: 'Search description…', 'aria-label': 'Search transactions', value: ui.q });
    const selType = el('select', { 'aria-label': 'Filter by type' }, el('option', { value: '', text: 'Income & expenses' }), el('option', { value: 'income', text: 'Income only' }), el('option', { value: 'expense', text: 'Expenses only' }));
    const selCat = el('select', { 'aria-label': 'Filter by category' }, el('option', { value: '', text: 'All categories' }), [...EXP_CATS, ...INC_CATS].map((c) => el('option', { value: c.value, text: c.label })));
    const selMethod = el('select', { 'aria-label': 'Filter by payment method' }, el('option', { value: '', text: 'All methods' }), METHODS.map((m) => el('option', { value: m.value, text: m.label })));
    selType.value = ui.type; selCat.value = ui.cat; selMethod.value = ui.method;
    search.addEventListener('input', () => { ui.q = search.value; paintList(); });
    selType.addEventListener('change', () => { ui.type = selType.value; paintList(); });
    selCat.addEventListener('change', () => { ui.cat = selCat.value; paintList(); });
    selMethod.addEventListener('change', () => { ui.method = selMethod.value; paintList(); });

    function stat(label, value, acc, icon, sub) {
      return el('div', { class: 'card stat-card', 'data-accent': acc }, el('div', { class: 'stat-top' }, el('div', { class: 'stat-label', text: label }), el('span', { class: 'stat-ico' }, FF.ui.icon(icon))),
        el('div', { class: 'stat-value num', text: value }), sub ? el('div', { class: 'stat-sub', text: sub }) : null);
    }

    function paintSummary() {
      const s = summary(ui.month);
      monthLabel.textContent = util.formatDate(ui.month + '-01', 'month');
      clear(cards);
      cards.append(stat('Income', util.money(s.income), 'green', 'wallet'), stat('Expenses', util.money(s.expense), 'flame', 'wallet'),
        stat('Remaining balance', util.money(s.balance), s.balance < 0 ? 'red' : 'teal', 'wallet', s.balance < 0 ? 'Spending exceeds income this month' : 'Income minus expenses'));

      clear(budgetBox);
      budgetBox.append(el('div', { class: 'card-title' }, el('h3', { text: 'Monthly budget' }), el('button', { type: 'button', class: 'btn btn-sm', onclick: setBudget }, FF.ui.icon('edit'), s.budget ? 'Change' : 'Set budget')));
      if (!s.budget) budgetBox.appendChild(el('p', { class: 'muted', text: 'Set a monthly spending budget to track how much is left.' }));
      else {
        const p = s.expense / s.budget;
        const over = p > 1;
        budgetBox.append(
          el('div', { class: 'spread' }, el('b', { class: 'num', text: util.money(s.expense) + ' of ' + util.money(s.budget) }), el('span', { class: 'badge', 'data-accent': over ? 'flame' : p > 0.8 ? 'armor' : 'green', text: Math.round(p * 100) + '% used' })),
          el('div', { class: 'bar', 'data-accent': over ? 'flame' : p > 0.8 ? 'armor' : 'green', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.min(100, Math.round(p * 100)), 'aria-label': 'Budget used' }, el('i', { style: { width: Math.min(100, p * 100) + '%' } })),
          el('p', { class: 'small muted', text: over ? 'Over budget by ' + util.money(s.expense - s.budget) + '.' : util.money(s.budget - s.expense) + ' left to spend this month.' }));
      }

      clear(catBox);
      catBox.appendChild(el('div', { class: 'card-title' }, el('h3', { text: 'Spending by category' })));
      if (!s.byCat.length) catBox.appendChild(el('div', { class: 'empty small', text: 'No expenses recorded this month.' }));
      else {
        catBox.append(el('div', { class: 'donut-row' },
          FF.charts.donut({ data: s.byCat.map((c) => ({ label: c.label, value: c.total, accent: c.accent })), centerLabel: util.money(s.expense), centerSub: 'spent', size: 170, thickness: 22, ariaLabel: 'Donut chart of spending by category' }),
          el('ul', { class: 'legend-list' }, s.byCat.sort((a, b) => b.total - a.total).map((c) => el('li', null, el('i', { class: 'dot', 'data-accent': c.accent }), el('span', { class: 'grow', text: c.label }), el('b', { class: 'num', text: util.money(c.total) }), el('span', { class: 'muted small num', text: Math.round((c.total / s.expense) * 100) + '%' }))))));
      }

      clear(histBox);
      const months = Array.from({ length: 6 }, (_, i) => util.monthShift(ui.month, i - 5));
      const hist = months.map((m) => { const x = summary(m); return { key: m, income: x.income, expense: x.expense }; });
      histBox.appendChild(el('div', { class: 'card-title' }, el('h3', { text: 'Monthly history' })));
      if (hist.every((h) => !h.income && !h.expense)) histBox.appendChild(el('div', { class: 'empty small', text: 'History appears once you record transactions.' }));
      else histBox.append(
        el('div', { class: 'chart-box' }, FF.charts.bars({ data: hist.map((h) => ({ label: util.formatDate(h.key + '-01', 'monthShort'), values: [h.income, h.expense] })), series: [{ name: 'Income', accent: 'green' }, { name: 'Expenses', accent: 'flame' }], ariaLabel: 'Bar chart of income and expenses for the last 6 months', format: (v) => '₹' + (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : Math.round(v)) })),
        el('p', { class: 'small muted', text: 'Green = income, orange = expenses. ' + hist.map((h) => util.formatDate(h.key + '-01', 'monthShort') + ': +' + util.money(h.income) + ' / −' + util.money(h.expense)).join(' · ') }));
    }

    function paintList() {
      const base = load().filter((t) => t.date.startsWith(ui.month));
      const list = util.sortBy(base.filter((t) => util.matches(ui.q, t.description, catOf(t).label, t.method) && (!ui.type || t.type === ui.type) && (!ui.cat || t.category === ui.cat) && (!ui.method || t.method === ui.method)), (t) => t.date, (t) => t.createdAt).reverse();
      clear(listBox);
      count.textContent = base.length ? 'Showing ' + list.length + ' of ' + util.plural(base.length, 'transaction') + ' in ' + util.formatDate(ui.month + '-01', 'month') + '.' : '';
      if (!base.length) listBox.appendChild(el('li', { class: 'empty-li' }, el('div', { class: 'empty', 'data-accent': 'armor' }, el('div', { class: 'empty-icon' }, FF.ui.icon('wallet')), el('h3', { text: 'No transactions this month' }), el('p', { text: 'Record income and expenses to see totals and charts.' }),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openForm() }, FF.ui.icon('plus'), 'Add expense'))));
      else if (!list.length) listBox.appendChild(el('li', { class: 'empty-li' }, el('div', { class: 'empty small', text: 'No transactions match these filters.' })));
      list.forEach((t) => {
        const c = catOf(t);
        const inc = t.type === 'income';
        listBox.appendChild(el('li', { class: 'txn', 'data-accent': c.accent },
          el('span', { class: 'txn-ico' }, FF.ui.icon(inc ? 'download' : 'wallet')),
          el('div', { class: 'txn-main' }, el('b', { class: 'wrap-text', text: t.description || c.label }),
            el('span', { class: 'small muted', text: util.formatDate(t.date, 'long') + ' · ' + c.label + ' · ' + t.method })),
          el('b', { class: 'txn-amt num ' + (inc ? 'inc' : 'exp'), text: (inc ? '+' : '−') + util.money(t.amount), 'aria-label': (inc ? 'Income ' : 'Expense ') + util.money(t.amount) }),
          el('div', { class: 'task-actions' },
            el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Edit transaction: ' + (t.description || c.label), onclick: () => openForm(t) }, FF.ui.icon('edit')),
            el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Delete transaction: ' + (t.description || c.label), onclick: () => remove(t) }, FF.ui.icon('trash')))));
      });
    }
    const paintAll = () => { paintSummary(); paintList(); };

    root.append(
      el('div', { class: 'page-head' }, el('div', null, el('div', { class: 'hud-label', text: 'Resource ledger' }), el('h2', { class: 'page-title', text: 'Expense Tracker' }), el('p', { text: 'Track income, spending and your monthly budget in ₹.' })),
        el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-teal', onclick: () => openForm(null, 'income') }, FF.ui.icon('plus'), 'Income'), el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openForm(null, 'expense') }, FF.ui.icon('plus'), 'Expense'))),
      el('div', { class: 'notice', 'data-accent': 'cyan', style: { marginBottom: '16px' } }, FF.ui.icon('info'), el('span', null, 'This is a personal tracking tool, not financial advice. Data stays in this browser.')),
      el('div', { class: 'spread month-nav' },
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn btn-icon btn-sm', 'aria-label': 'Previous month', onclick: () => { ui.month = util.monthShift(ui.month, -1); paintAll(); } }, FF.ui.icon('chevL')), monthLabel,
          el('button', { type: 'button', class: 'btn btn-icon btn-sm', 'aria-label': 'Next month', onclick: () => { ui.month = util.monthShift(ui.month, 1); paintAll(); } }, FF.ui.icon('chevR'))),
        el('button', { type: 'button', class: 'btn btn-sm', onclick: () => { ui.month = util.monthKey(util.today()); paintAll(); } }, 'This month')),
      cards,
      el('div', { class: 'grid-12', style: { marginTop: 'var(--gap)' } }, el('div', { class: 'span-4' }, budgetBox), el('div', { class: 'span-8' }, catBox), el('div', { class: 'span-12' }, histBox)),
      el('div', { class: 'card filters', style: { marginTop: 'var(--gap)' } }, el('div', { class: 'search' }, FF.ui.icon('search'), search), el('div', { class: 'filter-selects' }, selType, selCat, selMethod)),
      count, listBox);

    paintAll();
    ctx.watch(['transactions', 'budget'], paintAll);
  }

  FF.expenses = { list: load, summary, budget, openForm, EXP_CATS, INC_CATS };
  FF.registerView({ id: 'expenses', label: 'Expense Tracker', title: 'Expense Tracker', crumb: 'Resource ledger', icon: 'wallet', accent: 'gold', render });
})();
