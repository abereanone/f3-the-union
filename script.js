const aoInfo = {
  '#the_breakroom': { time: '0600-0645', days: ['M', 'W'] },
  '#the_clocktower': { time: '0530-0615', days: ['Tu', 'Th'] },
  '#the_dock': { time: '0530-0615', days: ['M', 'W', 'F'] },
  '#the_farm': { time: '0530-0615', days: ['M'] },
  '#the_floor': { time: '0500-0545', days: ['F'] },
  '#the_forge': { time: '0530-0630', days: ['Tu', 'Th'] },
  '#the_fountain': { time: '0530-0615', days: ['W'] },
  '#the_factory': { time: '0530-0615', days: ['M', 'W', 'F'] },
  '#the_plant': { time: '0630-0730', days: ['Sa'] },
  '#the_redzone': { time: '0515-0600', days: ['Tu'] },
  '#the_show': { time: '0515-0600', days: ['Th'] },
  '#the_yard': { time: '0500-0545', days: ['F'] },
};

const preblastForm = document.getElementById('preblastForm');
const backblastForm = document.getElementById('backblastForm');
const aoSelect = document.getElementById('ao');
const dateInput = document.getElementById('date');
const timeInput = document.getElementById('time');
const outputDiv = document.getElementById('output');

function populateAO(selectElement) {
  for (const ao in aoInfo) {
    const option = document.createElement('option');
    option.value = ao;
    option.textContent = ao;
    selectElement.appendChild(option);
  }
}

populateAO(aoSelect);
populateAO(document.getElementById('bbAo'));

// Set default date to tomorrow
const today = new Date();
const bbDateInput = document.getElementById('bbDate');
bbDateInput.value = today.toISOString().split('T')[0];

const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
dateInput.value = tomorrow.toISOString().split('T')[0];

// Set initial default time
timeInput.value = aoInfo[aoSelect.value].time;

// Change time on AO change
aoSelect.addEventListener('change', () => {
  timeInput.value = aoInfo[aoSelect.value].time;
});

// Listen for radio button changes
const formRadios = document.querySelectorAll('input[name="formType"]');
formRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    const selected = document.querySelector('input[name="formType"]:checked').value;
    const isPre = selected === 'preblast';
    preblastForm.classList.toggle('hidden', !isPre);
    backblastForm.classList.toggle('hidden', isPre);
    outputDiv.textContent = '';
  });
});

// Generate output for Preblast
function generatePreblast() {
  const title = document.getElementById('title').value;
  const ao = document.getElementById('ao').value;
  const rawDate = new Date(document.getElementById('date').value);
  const date = `${String(rawDate.getMonth() + 1).padStart(2, '0')}/${String(rawDate.getDate()).padStart(2, '0')}/${String(rawDate.getFullYear()).slice(-2)}`;
  const time = document.getElementById('time').value;
  const who = document.getElementById('who').value;
  const what = document.getElementById('what').value;
  const gear = document.getElementById('gear').value;

  const message = `Pre-Blast: ${date}
Where: ${ao}
When: ${time}
Who: ${who}
What: ${title}
Gear: ${gear}
${what}
Hit that HC!`;

  outputDiv.textContent = message;
}

function generateBackblast() {
  const title = document.getElementById('bbTitle').value;
  const rawDate = new Date(document.getElementById('bbDate').value);
  const date = `${String(rawDate.getMonth() + 1).padStart(2, '0')}/${String(rawDate.getDate()).padStart(2, '0')}/${String(rawDate.getFullYear()).slice(-2)}`;
  const ao = document.getElementById('bbAo').value;
  const total = document.getElementById('bbTotal').value;
  const conditions = document.getElementById('bbConditions').value;
  const cop = document.getElementById('bbCop').value;
  const thang = document.getElementById('bbThang').value;
  const six = document.getElementById('bbSix').value;
  const announcements = document.getElementById('bbAnnouncements').value;

  const message = `Backblast: ${title}
Date: ${date}
AO: ${ao}
Q: 
PAX: 
FNG: 
Total Pax: ${total}
Fartsack: 
Conditions: ${conditions}

COP: ${cop}

The Thang: ${thang}

The Six: ${six}

Announcements: ${announcements}`;

  outputDiv.textContent = message;
}

// Copy output
function copyOutput() {
  const text = outputDiv.textContent;
  navigator.clipboard.writeText(text).then(
    () => alert('Copied to clipboard!'),
    () => alert('Failed to copy.')
  );
}
