const fs = require('fs');

const newHolidays = `  const OFFICIAL_HOLIDAYS_2026 = Object.freeze([
    { date: "2026-01-26", month: 0, day: "Monday", name: "Republic Day", nameHi: "गणतंत्र दिवस", namePa: "ਗਣਤੰਤਰ ਦਿਵਸ", type: "National", closed: true, description: "National holiday." },
    { date: "2026-02-01", month: 1, day: "Sunday", name: "Birthday Sri Guru Ravidass Ji", nameHi: "श्री गुरु रविदास जयंती", namePa: "ਸ੍ਰੀ ਗੁਰੂ ਰਵਿਦਾਸ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-02-15", month: 1, day: "Sunday", name: "Maha Shivratri", nameHi: "महाशिवरात्रि", namePa: "ਮਹਾ ਸ਼ਿਵਰਾਤਰੀ", type: "Gazetted", closed: true, description: "Gazetted festival holiday." },
    { date: "2026-03-04", month: 2, day: "Wednesday", name: "Holi", nameHi: "होली", namePa: "ਹੋਲੀ", type: "Gazetted", closed: true, description: "Festival of colours." },
    { date: "2026-03-21", month: 2, day: "Saturday", name: "Id-Ul-Fiter", nameHi: "ईद-उल-फ़ित्र", namePa: "ਈਦ-ਉਲ-ਫਿਤਰ", type: "Gazetted", closed: true, description: "Gazetted religious holiday." },
    { date: "2026-03-23", month: 2, day: "Monday", name: "Martyrdom Day of Shaheed-e-Azam Bhagat Singh, Sukhdev and Rajguru Ji", nameHi: "शहीदी दिवस", namePa: "ਸ਼ਹੀਦੀ ਦਿਵਸ", type: "Gazetted", closed: true, description: "State holiday commemorating the martyrs." },
    { date: "2026-03-26", month: 2, day: "Thursday", name: "Ram Navmi", nameHi: "राम नवमी", namePa: "ਰਾਮ ਨਵਮੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-03-30", month: 2, day: "Monday", name: "Nagar Kirtan (Mahavir Jayanti)", nameHi: "नगर कीर्तन", namePa: "ਨਗਰ ਕੀਰਤਨ", type: "Half-day", closed: false, description: "Second half-day holiday to join Nagar Kirtan." },
    { date: "2026-03-31", month: 2, day: "Tuesday", name: "Mahavir Jayanti", nameHi: "महावीर जयंती", namePa: "ਮਹਾਵੀਰ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-04-03", month: 3, day: "Friday", name: "Good Friday", nameHi: "गुड फ्राइडे", namePa: "ਗੁੱਡ ਫਰਾਈਡੇ", type: "Gazetted", closed: true, description: "Gazetted Christian holiday." },
    { date: "2026-04-14", month: 3, day: "Tuesday", name: "Baisakhi & Birthday Dr. B.R. Ambedkar", nameHi: "बैसाखी और डॉ. बी.आर. अम्बेडकर जयंती", namePa: "ਵਿਸਾਖੀ ਅਤੇ ਡਾ. ਬੀ.ਆਰ. ਅੰਬੇਡਕਰ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Baisakhi and Birthday of Dr. B.R. Ambedkar." },
    { date: "2026-04-19", month: 3, day: "Sunday", name: "Bhagwan Parshu Ram Janam Utsav", nameHi: "भगवान परशुराम जन्म उत्सव", namePa: "ਭਗਵਾਨ ਪਰਸ਼ੂਰਾਮ ਜਨਮ ਉਤਸਵ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-05-01", month: 4, day: "Friday", name: "May Diwas", nameHi: "मई दिवस", namePa: "ਮਈ ਦਿਵਸ", type: "Gazetted", closed: true, description: "May Day / Labour Day." },
    { date: "2026-05-27", month: 4, day: "Wednesday", name: "Id-ul-Juha (Bakreed)", nameHi: "बकरीद", namePa: "ਬਕਰੀਦ", type: "Gazetted", closed: true, description: "Gazetted Islamic festival." },
    { date: "2026-06-17", month: 5, day: "Wednesday", name: "Nagar Kirtan (Sri Guru Arjan Dev Ji)", nameHi: "नगर कीर्तन", namePa: "ਨਗਰ ਕੀਰਤਨ", type: "Half-day", closed: false, description: "Second half-day holiday to join Nagar Kirtan." },
    { date: "2026-06-18", month: 5, day: "Thursday", name: "Martyrdom Day of Sri Guru Arjan Dev JI", nameHi: "गुरु अर्जुन देव जी शहीदी दिवस", namePa: "ਗੁਰੂ ਅਰਜਨ ਦੇਵ ਜੀ ਸ਼ਹੀਦੀ ਦਿਹਾੜਾ", type: "Gazetted", closed: true, description: "Commemoration of the 5th Sikh Guru." },
    { date: "2026-06-29", month: 5, day: "Monday", name: "Kabir Jayanti", nameHi: "कबीर जयंती", namePa: "ਕਬੀਰ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-07-31", month: 6, day: "Friday", name: "Martyrdom Day Shaheed Udham Singh Ji", nameHi: "शहीद उधम सिंह शहीदी दिवस", namePa: "ਸ਼ਹੀਦ ਊਧਮ ਸਿੰਘ ਸ਼ਹੀਦੀ ਦਿਹਾੜਾ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-08-15", month: 7, day: "Saturday", name: "Independence Day", nameHi: "स्वतंत्रता दिवस", namePa: "ਸੁਤੰਤਰਤਾ ਦਿਵਸ", type: "National", closed: true, description: "National Independence Day of India." },
    { date: "2026-09-03", month: 8, day: "Thursday", name: "Nagar Kirtan (Janam Ashtami)", nameHi: "नगर कीर्तन", namePa: "ਨਗਰ ਕੀਰਤਨ", type: "Half-day", closed: false, description: "Second half-day holiday to join Nagar Kirtan." },
    { date: "2026-09-04", month: 8, day: "Friday", name: "Janam Ashtami", nameHi: "जन्माष्टमी", namePa: "ਜਨਮ ਅਸ਼ਟਮੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-10-02", month: 9, day: "Friday", name: "Birthday Mahatma Gandhi Ji", nameHi: "गांधी जयंती", namePa: "ਗਾਂਧੀ ਜੈਅੰਤੀ", type: "National", closed: true, description: "Birth anniversary of Mahatma Gandhi." },
    { date: "2026-10-11", month: 9, day: "Sunday", name: "Maharaj Aggarsain Jayanti", nameHi: "महाराज अग्रसेन जयंती", namePa: "ਮਹਾਰਾਜ ਅਗਰਸੈਨ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-10-20", month: 9, day: "Tuesday", name: "Dussehra", nameHi: "दशहरा", namePa: "ਦੁਸਹਿਰਾ", type: "Gazetted", closed: true, description: "Victory of good over evil." },
    { date: "2026-10-26", month: 9, day: "Monday", name: "Birthday Maharishi Balmiki Ji", nameHi: "महर्षि वाल्मीकि जयंती", namePa: "ਮਹਾਰਿਸ਼ੀ ਵਾਲਮੀਕਿ ਜੈਅੰਤੀ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-10-27", month: 9, day: "Tuesday", name: "Parkash Gurparab Sri Guru Ram Dass Sahib Ji", nameHi: "गुरु राम दास जी प्रकाश पर्व", namePa: "ਸ੍ਰੀ ਗੁਰੂ ਰਾਮ ਦਾਸ ਜੀ ਪ੍ਰਕਾਸ਼ ਪੁਰਬ", type: "Restricted", closed: false, description: "Restricted holiday." },
    { date: "2026-11-08", month: 10, day: "Sunday", name: "Diwali", nameHi: "दीवाली", namePa: "ਦੀਵਾਲੀ", type: "Gazetted", closed: true, description: "Festival of lights." },
    { date: "2026-11-09", month: 10, day: "Monday", name: "Vishwakarma Day", nameHi: "विश्वकर्मा दिवस", namePa: "ਵਿਸ਼ਵਕਰਮਾ ਦਿਵਸ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-11-11", month: 10, day: "Wednesday", name: "Gurgaddi Diwas Sri Guru Granth Sahib Ji", nameHi: "गुरु ग्रंथ साहिब गुरुगद्दी दिवस", namePa: "ਸ੍ਰੀ ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ ਗੁਰਗੱਦੀ ਦਿਵਸ", type: "Restricted", closed: false, description: "Restricted holiday." },
    { date: "2026-11-16", month: 10, day: "Monday", name: "Martyrdom Day of S. Kartar Singh Sarabha Ji", nameHi: "शहीद करतार सिंह सराभा शहीदी दिवस", namePa: "ਸ਼ਹੀਦ ਕਰਤਾਰ ਸਿੰਘ ਸਰਾਭਾ ਸ਼ਹੀਦੀ ਦਿਹਾੜਾ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-11-23", month: 10, day: "Monday", name: "Nagar Kirtan (Sri Guru Nanak Dev Ji)", nameHi: "नगर कीर्तन", namePa: "ਨਗਰ ਕੀਰਤਨ", type: "Half-day", closed: false, description: "Second half-day holiday to join Nagar Kirtan." },
    { date: "2026-11-24", month: 10, day: "Tuesday", name: "Birthday Sri Guru Nanak Dev Sahib Ji", nameHi: "गुरु नानक जयंती", namePa: "ਗੁਰੂ नानਕ ਦੇਵ ਜੀ ਪ੍ਰਕਾਸ਼ ਪੁਰਬ", type: "Gazetted", closed: true, description: "Gazetted holiday." },
    { date: "2026-12-14", month: 11, day: "Monday", name: "Martyrdom Day of Sri Guru Teg Bahadur Ji", nameHi: "गुरु तेग बहादुर शहीदी दिवस", namePa: "ਗੁਰੂ ਤੇਗ ਬਹਾਦਰ ਜੀ ਸ਼ਹੀਦੀ ਦਿਹਾੜਾ", type: "Gazetted", closed: true, description: "Commemoration of the 9th Sikh Guru." },
    { date: "2026-12-25", month: 11, day: "Friday", name: "Christmas Day", nameHi: "क्रिसमस", namePa: "ਕ੍ਰਿਸਮਿਸ", type: "Gazetted", closed: true, description: "Christmas celebration." },
    { date: "2026-12-28", month: 11, day: "Monday", name: "Shaheedi Sabha Fatehgarh Sahib", nameHi: "शहीदी सभा फतेहगढ़ साहिब", namePa: "ਸ਼ਹੀਦੀ ਸਭਾ ਫਤਹਿਗੜ੍ਹ ਸਾਹਿਬ", type: "Gazetted", closed: true, description: "Gazetted holiday." }
  ]);`;

let content = fs.readFileSync('public/brain-kernel.js', 'utf8');
const startMatch = '  const OFFICIAL_HOLIDAYS_2026 = Object.freeze([';
const endMatch = '  ]);';
const startIndex = content.indexOf(startMatch);
const endIndex = content.indexOf(endMatch, startIndex) + endMatch.length;

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + newHolidays + content.substring(endIndex);
  fs.writeFileSync('public/brain-kernel.js', content);
  console.log('Successfully updated holidays');
} else {
  console.log('Could not find holidays array in brain-kernel.js');
}
