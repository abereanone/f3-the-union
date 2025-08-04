const dayMap = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];
const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const aoDayNames = {
  'Su': 'Sunday',
  'M':  'Monday',
  'Tu': 'Tuesday',
  'W':  'Wednesday',
  'Th': 'Thursday',
  'F':  'Friday',
  'Sa': 'Saturday'
};

const aoInfo = {
  '#the_breakroom': { time: '0600-0645', days: ['M', 'W'] },
  '#the_clocktower': { time: '0530-0615', days: ['Tu', 'Th'] },
  '#the_dock':       { time: '0530-0615', days: ['M', 'W'] },
  '#the_factory':    { time: '0530-0615', days: ['M', 'W', 'F'] },
  '#the_farm':       { time: '0530-0615', days: ['M'] },
  '#the_floor':      { time: '0500-0545', days: ['F'] },
  '#the_forge':      { time: '0530-0615', days: ['F'] },
  '#the_fountain':   { time: '0530-0615', days: ['W'] },
  '#the_plant':      { time: '0630-0730', days: ['Sa'] },
  '#the_redzone':    { time: '0515-0600', days: ['Tu'] },
  '#the_show':       { time: '0515-0600', days: ['Tu', 'Th'] },
  '#the_yard':       { time: '0500-0545', days: ['F'] }
};

// DOM elements
const warningDiv    = document.getElementById('warning');
const preblastForm  = document.getElementById('preblastForm');
const backblastForm = document.getElementById('backblastForm');
const aoSelect      = document.getElementById('ao');
const bbAoSelect    = document.getElementById('bbAo');
const dateInput     = document.getElementById('date');
const bbDateInput   = document.getElementById('bbDate');
const timeInput     = document.getElementById('time');
const outputDiv     = document.getElementById('output');

// Clear warnings
function resetWarningDiv() {
  warningDiv.textContent = '';
  warningDiv.classList.remove('visible');
}

// Populate AO dropdowns
function populateAO(selectElement) {
  for (const ao in aoInfo) {
    const opt = document.createElement('option');
    opt.value = ao;
    opt.textContent = ao;
    selectElement.appendChild(opt);
  }
  selectElement.value = '#the_show';
}
populateAO(aoSelect);
populateAO(bbAoSelect);

// Helpers to find next/previous meeting dates
function getNextMeetingDate(aoKey, fromDate) {
  const aoDays       = aoInfo[aoKey]?.days || [];
  const aoDayIndices = aoDays.map(code => dayMap.indexOf(code));
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 7; i++) {
    if (aoDayIndices.includes(d.getDay())) return new Date(d);
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function getPreviousMeetingDate(aoKey, fromDate) {
  const aoDays       = aoInfo[aoKey]?.days || [];
  const aoDayIndices = aoDays.map(code => dayMap.indexOf(code));
  const d = new Date(fromDate);
  for (let i = 0; i < 7; i++) {
    if (aoDayIndices.includes(d.getDay())) return new Date(d);
    d.setDate(d.getDate() - 1);
  }
  return d;
}

// Initialize default dates and time
const today = new Date();
dateInput.value  = getNextMeetingDate(aoSelect.value, today)
  .toISOString().split('T')[0];
bbDateInput.value = getPreviousMeetingDate(bbAoSelect.value, today)
  .toISOString().split('T')[0];
timeInput.value  = aoInfo[aoSelect.value].time;

// AO change handlers
aoSelect.addEventListener('change', () => {
  timeInput.value = aoInfo[aoSelect.value].time;
  dateInput.value = getNextMeetingDate(aoSelect.value, new Date())
    .toISOString().split('T')[0];
  resetWarningDiv();
});

bbAoSelect.addEventListener('change', () => {
  bbDateInput.value = getPreviousMeetingDate(bbAoSelect.value, new Date())
    .toISOString().split('T')[0];
  resetWarningDiv();
});

// Form toggle
const formRadios = document.querySelectorAll('input[name="formType"]');
formRadios.forEach(radio => radio.addEventListener('change', () => {
  const isPre = document.querySelector('input[name="formType"]:checked').value === 'preblast';
  preblastForm.classList.toggle('hidden', !isPre);
  backblastForm.classList.toggle('hidden', isPre);
  outputDiv.textContent = '';
  resetWarningDiv();
}));

// Generate Preblast
function generatePreblast() {
  resetWarningDiv();
  outputDiv.textContent = '';

  const title   = document.getElementById('title').value;
  const ao      = aoSelect.value;
  const isoDate = dateInput.value;             // "YYYY-MM-DD"
  const [yyyy, mm, dd] = isoDate.split('-');
  const display = `${mm}/${dd}/${yyyy.slice(-2)}`; // "MM/DD/YY"

  checkAoDayMatch(ao, isoDate);

  const time = timeInput.value;
  const who  = document.getElementById('who').value;
  const what = document.getElementById('what').value;
  const gear = document.getElementById('gear').value;

  const msg = `Pre-Blast: ${display}\nWhere: ${ao}\nWhen: ${time}\nWho: ${who}\nWhat: ${title}\nGear: ${gear}\n${what}\nHit that HC!`;
  outputDiv.textContent = msg;
}

// Generate Backblast
function generateBackblast() {
  resetWarningDiv();
  outputDiv.textContent = '';

  const title   = document.getElementById('bbTitle').value;
  const ao      = bbAoSelect.value;
  const isoDate = bbDateInput.value;
  const [yyyy, mm, dd] = isoDate.split('-');
  const display = `${mm}/${dd}/${yyyy.slice(-2)}`;

  checkAoDayMatch(ao, isoDate);

  const total         = document.getElementById('bbTotal').value;
  const conditions    = document.getElementById('bbConditions').value;
  const cop           = document.getElementById('bbCop').value;
  const thang         = document.getElementById('bbThang').value;
  const six           = document.getElementById('bbSix').value;
  const announcements = document.getElementById('bbAnnouncements').value;

  const msg = `Backblast: ${title}\nDate: ${display}\nAO: ${ao}\nQ: \nPAX: \nCount: ${total}\nFNG: \nFartsack: \nConditions: ${conditions}\n\nCOP: ${cop}\n\nThe Thang: ${thang}\n\nThe Six: ${six}\n\nAnnouncements: ${announcements}`;

  outputDiv.textContent = msg;
}

// Copy to clipboard
function copyOutput() {
  navigator.clipboard.writeText(outputDiv.textContent)
    .then(() => alert('Copied to clipboard!'))
    .catch(() => alert('Failed to copy.'));
}

// Day-of-week check
function checkAoDayMatch(selectedAo, selectedDateStr) {
  resetWarningDiv();
  const aoDays = aoInfo[selectedAo]?.days || [];
  const [yyyy, mm, dd] = selectedDateStr.split('-').map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  const dow = d.getDay();
  const code = dayMap[dow];
  const full = dayNamesFull[dow];
  if (!aoDays.includes(code)) {
    const names = aoDays.map(c => aoDayNames[c]).join(', ');
    warningDiv.textContent = `⚠️ ${selectedAo} usually meets on ${names}, but you selected ${full}.`;
    setTimeout(() => warningDiv.classList.add('visible'), 50);
  }
}
