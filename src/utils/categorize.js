/**
 * Auto-detect project category from title and definition text
 */
const CATEGORY_KEYWORDS = {
  'AI / Machine Learning':   ['ai','machine learning','ml','deep learning','neural','nlp','computer vision','prediction','classification','tensorflow','pytorch','chatbot','recommendation'],
  'Web Development':         ['web','website','html','css','react','angular','vue','node','express','django','flask','php','laravel','frontend','backend','fullstack'],
  'Mobile Application':      ['mobile','android','ios','flutter','react native','app','smartphone','kotlin','swift'],
  'E-Commerce':              ['ecommerce','e-commerce','shopping','cart','payment','store','marketplace','product','order','invoice'],
  'Management System':       ['management','system','erp','crm','inventory','hospital','school','college','library','employee','hr','attendance','payroll'],
  'IoT / Hardware':          ['iot','internet of things','arduino','raspberry','sensor','embedded','hardware','microcontroller','automation','smart'],
  'Cybersecurity':           ['security','cybersecurity','firewall','encryption','hacking','vulnerability','authentication','penetration','malware'],
  'Data Analytics':          ['data','analytics','visualization','dashboard','tableau','power bi','statistics','big data','hadoop','spark','excel','report'],
  'Cloud Computing':         ['cloud','aws','azure','gcp','docker','kubernetes','devops','microservice','serverless','deployment'],
  'Blockchain':              ['blockchain','crypto','nft','smart contract','ethereum','bitcoin','decentralized','web3','solidity'],
  'Game Development':        ['game','gaming','unity','unreal','2d','3d','player','level','score','multiplayer','vr','ar'],
  'Healthcare':              ['health','medical','hospital','patient','doctor','telemedicine','clinical','pharmacy','diagnosis','appointment'],
  'Education Technology':    ['education','learning','student','teacher','course','lms','quiz','online learning','e-learning','tutor'],
  'Finance / Banking':       ['finance','banking','bank','loan','insurance','accounting','budget','stock','investment','transaction','ledger'],
};

function detectCategory(title = '', definition = '') {
  const text = (title + ' ' + definition).toLowerCase();

  let bestCategory = 'Other';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.reduce((count, kw) => {
      return count + (text.includes(kw) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

module.exports = { detectCategory };