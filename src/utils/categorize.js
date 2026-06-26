/**
 * Auto-detect project category from title and definition text
 */
const CATEGORY_KEYWORDS = {
  'AI / Machine Learning':   ['artificial intelligence','machine learning','deep learning','neural network','nlp','natural language','computer vision','prediction','classification','tensorflow','pytorch','chatbot','recommendation',' ai ','ai-based','ai based','face recognition','speech recognition','object detection','image recognition','attendance system','smart attendance','automated attendance'],
  'Web Development':         ['web application','web portal','web platform','website','html','css','react','angular','vue','node.js','express','django','flask','php','laravel','frontend','backend','fullstack','full stack'],
  'Mobile Application':      ['mobile app','android app','ios app','flutter','react native','smartphone app','kotlin','swift','mobile application'],
  'E-Commerce':              ['ecommerce','e-commerce','online shopping','shopping cart','payment gateway','online store','marketplace','product catalog','order management','invoice'],
  'Management System':       ['management system','erp','crm','inventory management','hospital management','school management','college management','library management','employee management','hr system','payroll','hostel management','hotel management'],
  'IoT / Hardware':          ['iot','internet of things','arduino','raspberry pi','sensor','embedded system','hardware','microcontroller','home automation','smart home'],
  'Cybersecurity':           ['cybersecurity','cyber security','firewall','encryption','penetration testing','vulnerability','malware','intrusion detection','network security'],
  'Data Analytics':          ['data analytics','data visualization','dashboard','business intelligence','big data','hadoop','spark','reporting system','data mining','power bi','tableau'],
  'Cloud Computing':         ['cloud computing','aws','azure','google cloud','docker','kubernetes','devops','microservices','serverless','cloud platform'],
  'Blockchain':              ['blockchain','cryptocurrency','smart contract','ethereum','bitcoin','decentralized','web3','solidity','nft'],
  'Game Development':        ['game development','video game','unity','unreal engine','2d game','3d game','multiplayer','game design','vr','ar'],
  'Healthcare':              ['healthcare system','medical system','hospital system','patient management','doctor appointment','telemedicine','clinical','pharmacy system','health monitoring','diagnosis system'],
  'Education Technology':    ['e-learning','online learning','learning management','lms','quiz system','exam system','online course','student portal','education platform','tutoring'],
  'Finance / Banking':       ['banking system','finance system','loan management','insurance','accounting system','budget tracker','stock market','investment','transaction','ledger'],
};

function detectCategory(title = '', definition = '') {
  const text = (title + ' ' + definition).toLowerCase();

  let bestCategory = 'Other';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.reduce((count, kw) => {
      return count + (text.includes(kw.toLowerCase()) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

module.exports = { detectCategory };