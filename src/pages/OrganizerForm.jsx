import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '../UserContext.jsx';
import { getAuthToken } from '../utils/getAuthToken.js';
import { uploadImage } from '../utils/cloudinaryUpload.js';
import AbuseFieldWrapper from '../components/AbuseFieldWrapper.jsx';

const countriesList = ["India"];

const locationData = {
  "India": {
    "Andaman and Nicobar Islands": ["Nicobar", "North and Middle Andaman", "South Andaman"],
    "Andhra Pradesh": ["Alluri Sitharama Raju", "Anakapalli", "Anantapur", "Annamayya", "Bapatla", "Chittoor", "East Godavari", "Eluru", "Guntur", "Kakinada", "Konaseema", "Krishna", "Kurnool", "Markapuram", "Nandyal", "NTR", "Palnadu", "Parvathipuram Manyam", "Polavaram", "Prakasam", "SPS Nellore", "Sri Sathya Sai", "Srikakulam", "Tirupati", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR Kadapa"],
    "Arunachal Pradesh": ["Anjaw", "Bichom", "Changlang", "East Kameng", "East Siang", "Kamle", "Kra Daadi", "Kurung Kumey", "Keyi Panyor", "Lepa Rada", "Lohit", "Longding", "Lower Dibang Valley", "Lower Siang", "Lower Subansiri", "Namsai", "Pakke Kessang", "Papum Pare", "Shi Yomi", "Siang", "Tawang", "Tirap", "Dibang Valley", "Upper Siang", "Upper Subansiri", "West Kameng", "West Siang"],
    "Assam": ["Bajali", "Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", "Chirang", "Darrang", "Dhemaji", "Dhubri", "Dibrugarh", "Dima Hasao", "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Jorhat", "Kamrup", "Kamrup Metropolitan", "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli", "Marigaon", "Nagaon", "Nalbari", "Sivasagar", "Sonitpur", "South Salmara Mankachar", "Tamulpur", "Tinsukia", "Udalguri", "West Karbi Anglong"],
    "Bihar": ["Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur", "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"],
    "Chandigarh": ["Chandigarh"],
    "Chhattisgarh": ["Balod", "Baloda Bazar", "Balrampur", "Bastar", "Bemetara", "Bijapur", "Bilaspur", "Dantewada", "Dhamtari", "Durg", "Gariaband", "Gaurela-Pendra-Marwahi", "Janjgir-Champa", "Jashpur", "Kabirdham", "Kanker", "Khairgarh-Chhuikhadan-Gandai", "Kondagaon", "Korba", "Koriya", "Mahasamund", "Manendragarh", "Mohla-Manpur-Ambagarh Chowki", "Mungeli", "Narayanpur", "Raigarh", "Raipur", "Rajnandgaon", "Sakti", "Sarangarh-Bilaigarh", "Sukma", "Surajpur", "Surguja"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Dadra and Nagar Haveli", "Daman", "Diu"],
    "Delhi": ["Central Delhi", "Central North Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi", "North West Delhi", "Old Delhi", "Outer North Delhi", "South Delhi", "South East Delhi", "South West Delhi", "West Delhi"],
    "Goa": ["Kushavati", "North Goa", "South Goa"],
    "Gujarat": ["Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch", "Bhavnagar", "Botad", "Chhota Udaipur", "Dahod", "Dang", "Devbhoomi Dwarka", "Gandhinagar", "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch", "Mahisagar", "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", "Porbandar", "Rajkot", "Sabarkantha", "Surat", "Surendranagar", "Tapi", "Vadodara", "Valsad", "Vav-Tharad"],
    "Haryana": ["Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad", "Gurugram", "Hansi", "Hisar", "Jhajjar", "Jind", "Kaithal", "Karnal", "Kurukshetra", "Mahendragarh", "Nuh", "Palwal", "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar"],
    "Himachal Pradesh": ["Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul and Spiti", "Mandi", "Shimla", "Sirmaur", "Solan", "Una"],
    "Jammu and Kashmir": ["Anantnag", "Bandipora", "Baramulla", "Budgam", "Doda", "Ganderbal", "Jammu", "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Pulwama", "Rajouri", "Ramban", "Reasi", "Samba", "Shopian", "Srinagar", "Udhampur"],
    "Jharkhand": ["Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Garhwa", "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara", "Khunti", "Koderma", "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi", "Sahebganj", "Seraikela Kharsawan", "Simdega", "West Singhbhum"],
    "Karnataka": ["Bagalkote", "Bangalore Rural", "Bangalore Urban", "Belagavi", "Bellary", "Bidar", "Chamarajanagara", "Chikkaballapura", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagara", "Vijayapura", "Yadgiri"],
    "Kerala": ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"],
    "Ladakh": ["Changthang", "Drass", "Kargil", "Leh", "Nubra", "Sham", "Zanskar"],
    "Lakshadweep": ["Lakshadweep"],
    "Madhya Pradesh": ["Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind", "Bhopal", "Burhanpur", "Chachaura", "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar", "Dindori", "Guna", "Gwalior", "Harda", "Indore", "Jabalpur", "Jhabua", "Katni", "Khandwa", "Khargone", "Maihar", "Mandla", "Mandsaur", "Mauganj", "Morena", "Narmadapuram", "Narsinghpur", "Neemuch", "Niwari", "Pandhurna", "Panna", "Raisen", "Rajgarh", "Ratlam", "Rewa", "Sagar", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi", "Singrauli", "Tikamgarh", "Ujjain", "Umaria", "Vidisha"],
    "Maharashtra": ["Ahmednagar", "Akola", "Amravati", "Aurangabad", "Beed", "Bhandara", "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar", "Nashik", "Osmanabad", "Palghar", "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal"],
    "Manipur": ["Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", "Jiribam", "Kakching", "Kamjong", "Kangpokpi", "Noney", "Pherzawl", "Senapati", "Tamenglong", "Tengnoupal", "Thoubal", "Ukhrul"],
    "Meghalaya": ["East Garo Hills", "East Jaintia Hills", "East Khasi Hills", "Eastern West Khasi Hills", "North Garo Hills", "Ri Bhoi", "South Garo Hills", "South West Garo Hills", "South West Khasi Hills", "West Garo Hills", "West Jaintia Hills", "West Khasi Hills"],
    "Mizoram": ["Aizawl", "Champhai", "Hnahthial", "Khawzawl", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", "Saiha", "Saitual", "Serchhip"],
    "Nagaland": ["Chümoukedima", "Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Niuland", "Noklak", "Peren", "Phek", "Shamator", "Tseminyü", "Tuensang", "Wokha", "Zünheboto"],
    "Odisha": ["Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack", "Deogarh", "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghpur", "Jajpur", "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Kendujhar", "Khordha", "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur", "Nayagarh", "Nuapada", "Puri", "Rayagada", "Sambalpur", "Subarnapur", "Sundargarh"],
    "Puducherry": ["Karaikal", "Mahe", "Puducherry", "Yanam"],
    "Punjab": ["Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka", "Firozpur", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Kapurthala", "Ludhiana", "Malerkotla", "Mansa", "Moga", "Mohali", "Muktsar", "Pathankot", "Patiala", "Rupnagar", "Sangrur", "Shaheed Bhagat Singh Nagar", "Tarn Taran"],
    "Rajasthan": ["Ajmer", "Alwar", "Anupgarh", "Balotra", "Banswara", "Baran", "Barmer", "Beawar", "Bharatpur", "Bhilwara", "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", "Deeg", "Dholpur", "Didwana Kuchaman", "Dudu", "Dungarpur", "Gangapur City", "Hanumangarh", "Jaipur", "Jaipur Rural", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Jodhpur Rural", "Karauli", "Kekri", "Khairthal-Tijara", "Kota", "Kotputli-Behror", "Nagaur", "Neem Ka Thana", "Pali", "Phalodi", "Pratapgarh", "Rajsamand", "Salumber", "Sanchore", "Sawai Madhopur", "Shahpura", "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur"],
    "Sikkim": ["East Sikkim", "North Sikkim", "Pakyong", "Soreng", "South Sikkim", "West Sikkim"],
    "Tamil Nadu": ["Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kancheepuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar"],
    "Telangana": ["Adilabad", "Bhadradri Kothagudem", "Hanamkonda", "Hyderabad", "Jagtial", "Jangaon", "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam", "Kumuram Bheem", "Mahabubabad", "Mahabubnagar", "Mancherial", "Medak", "Medchal-Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal", "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Ranga Reddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad", "Wanaparthy", "Warangal", "Yadadri Bhuvanagiri"],
    "Tripura": ["Dhalai", "Gomati", "Khowai", "North Tripura", "Sipahijala", "South Tripura", "Unakoti", "West Tripura"],
    "Uttar Pradesh": ["Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", "Ayodhya", "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur", "Banda", "Barabanki", "Bareilly", "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria", "Etah", "Etawah", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddh Nagar", "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj", "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kheri", "Kushinagar", "Lalitpur", "Lucknow", "Maharajganj", "Mahoba", "Mainpuri", "Mathura", "Mau", "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", "Pilibhit", "Pratapgarh", "Prayagraj", "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar", "Shahjahanpur", "Shamli", "Shrawasti", "Siddharthnagar", "Sitapur", "Sonbhadra", "Sultanpur", "Unnao", "Varanasi"],
    "Uttarakhand": ["Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar", "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi"],
    "West Bengal": ["Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", "Darjeeling", "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", "Kalimpong", "Kolkata", "Malda", "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman", "Paschim Medinipur", "Purba Bardhaman", "Purba Medinipur", "Purulia", "South 24 Parganas", "Uttar Dinajpur"]
  }
};

const STEPS = [
  { id: 1, title: 'Personal Verification', subtitle: 'Verify your identity', icon: 'verified_user' },
  { id: 2, title: 'Organization', subtitle: 'Create your esports org', icon: 'workspaces' },
  { id: 3, title: 'Experience', subtitle: 'Your organizer journey', icon: 'trending_up' },
  { id: 4, title: 'Operations', subtitle: 'Tournament plans', icon: 'sports_esports' },
  { id: 5, title: 'Trust & Safety', subtitle: 'Commit to fair play', icon: 'shield' },
  { id: 6, title: 'Review', subtitle: 'Final review & submit', icon: 'task_alt' },
];

const ageGroups = ['Under 18', '18–24', '25–34', '35+'];
const idTypes = ['Aadhaar', 'PAN', 'Passport', 'Driving License', 'Other'];
const tournamentsOrg = ['None', '1–5', '6–10', '11–25', '26–50', '50+'];
const expLevels = ['First Time Organizer', 'Beginner', 'Intermediate', 'Experienced', 'Professional'];
const monthlyTourneys = ['1', '2–3', '4–5', '6–10', '10+'];
const hearAbout = ['Google Search', 'Instagram', 'Facebook', 'YouTube', 'Discord', 'Friend Recommendation', 'Tournament Organizer', 'Gaming Community', 'Influencer / Creator', 'Advertisement', 'Other'];
const adSources = ['Instagram Ad', 'Facebook Ad', 'Google Ad', 'YouTube Ad', 'Other'];
const gameOptions = ['BGMI', 'Valorant', 'CS2', 'Free Fire Max', 'Call of Duty Mobile', 'PUBG PC', 'Dota 2', 'League of Legends', 'Apex Legends', 'EA FC', 'Rocket League', 'Other'];
const formatOptions = ['Solo', 'Duo', 'Squad', '5v5', 'Custom'];
const participantRanges = ['Under 50', '50–100', '100–250', '250–500', '500+'];
const prizeRanges = ['No Prize Pool', 'Under ₹5,000', '₹5,000–₹25,000', '₹25,000–₹1 Lakh', '₹1 Lakh+'];

const STORAGE_KEY = 'md_org_onboarding';

function OrganizerForm({ onNavigate }) {
  const { currentUser } = useUser();
  const [allApps, setAllApps] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resumeAvailable, setResumeAvailable] = useState(false);

  const [applicantNameAbuse, setApplicantNameAbuse] = useState(false);
  const [orgNameAbuse, setOrgNameAbuse] = useState(false);
  const [orgMottoAbuse, setOrgMottoAbuse] = useState(false);
  const [orgDescAbuse, setOrgDescAbuse] = useState(false);

  const [cropImageSrc, setCropImageSrc] = useState('');
  const [cropImageName, setCropImageName] = useState('');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [kycFileInfo, setKycFileInfo] = useState({ size: 0, isValid: true, sizeText: '' });
  const [isUploadingKyc, setIsUploadingKyc] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const [citySearch, setCitySearch] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  const formInit = {
    applicantName: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: '',
    country: 'India',
    state: '',
    city: '',
    ageGroup: '',
    idType: '',
    kycImage: '',
    kycName: '',
    orgName: '',
    orgLogo: '',
    orgLogoName: '',
    orgBanner: '',
    orgBannerName: '',
    orgTagline: '',
    orgDescription: '',
    website: '',
    discord: '',
    instagram: '',
    youtube: '',
    twitter: '',
    tournamentsOrganized: '',
    hostingLevel: '',
    tournamentsPerMonth: '',
    heardFrom: '',
    adSource: '',
    games: [],
    formats: [],
    expectedParticipants: '',
    prizePool: '',
    policies: {
      fairPlay: false,
      antiCheat: false,
      refund: false,
      prizeDist: false,
      terms: false,
    }
  };

  const [form, setForm] = useState(formInit);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.currentStep) {
          setResumeAvailable(true);
        }
      } catch {}
    }
    loadDraftFromServer();
  }, []);

  useEffect(() => {
    if (currentUser?.email && !form.email) {
      setForm(prev => ({ ...prev, email: currentUser.email }));
    }
    if (currentUser?.name && !form.applicantName) {
      setForm(prev => ({ ...prev, applicantName: currentUser.name }));
    }
  }, [currentUser]);

  useEffect(() => {
    async function fetchOrgApps() {
      const token = await getAuthToken();
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      fetch('/api/org/applications', { headers })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.applications) setAllApps(data.applications);
        })
        .catch(() => {});
    }
    fetchOrgApps();
  }, []);

  const saveDraftToServer = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      await fetch('/api/org/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ formData: form, currentStep }),
      });
    } catch {}
  }, [form, currentStep]);

  const loadDraftFromServer = async () => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      const res = await fetch('/api/org/draft', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.draft) {
        setForm(prev => ({ ...prev, ...data.draft.formData }));
        setCurrentStep(data.draft.currentStep);
        setResumeAvailable(false);
      }
    } catch {}
  };

  const deleteDraftFromServer = async () => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      await fetch('/api/org/draft', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  };

  const resumeDraft = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const { currentStep: step, ...rest } = parsed;
        setForm(prev => ({ ...prev, ...rest }));
        setCurrentStep(step);
        setResumeAvailable(false);
      } catch {}
    }
  };

  const clearDraft = () => {
    localStorage.removeItem(STORAGE_KEY);
    deleteDraftFromServer();
    setForm(formInit);
    setCurrentStep(1);
    setResumeAvailable(false);
  };

  const updateForm = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updatePolicy = (key) => {
    setForm(prev => ({ ...prev, policies: { ...prev.policies, [key]: !prev.policies[key] } }));
  };

  const toggleArrayItem = (key, item) => {
    setForm(prev => {
      const arr = prev[key] || [];
      const next = arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
      return { ...prev, [key]: next };
    });
  };

  const validateStep = (step) => {
    const errors = [];
    if (step === 1) {
      if (!form.applicantName.trim()) errors.push('Full name is required');
      if (!form.phone.trim() || form.phone.length !== 10) errors.push('Valid 10-digit phone number required');
      if (!form.country) errors.push('Country is required');
      if (!form.state) errors.push('State is required');
      if (!form.city) errors.push('District is required');
      if (!form.ageGroup) errors.push('Age group is required');
      if (!form.idType) errors.push('ID type is required');
    }
    if (step === 2) {
      if (!form.orgName.trim()) errors.push('Organization name is required');
    }
    if (step === 5) {
      const p = form.policies;
      if (!p.fairPlay) errors.push('Please accept the Fair Play Policy');
      if (!p.antiCheat) errors.push('Please accept the Anti-Cheating Rules');
      if (!p.refund) errors.push('Please accept the Refund Policy');
      if (!p.prizeDist) errors.push('Please accept the Prize Distribution Policy');
      if (!p.terms) errors.push('Please accept Match District Terms & Conditions');
    }
    return errors;
  };

  const canProceed = (step) => {
    return validateStep(step).length === 0;
  };

  const handleNext = () => {
    if (!canProceed(currentStep)) {
      const errs = validateStep(currentStep);
      alert(errs.join('\n'));
      return;
    }
    saveDraftToServer();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentStep(prev => Math.min(prev + 1, 6));
  };

  const handleBack = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const jumpToStep = (step) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentStep(step);
  };

  const getTrustScore = () => {
    let score = 0;
    if (form.applicantName) score += 5;
    if (form.phone) score += 5;
    if (form.country && form.state && form.city) score += 10;
    if (form.ageGroup) score += 5;
    if (form.idType && form.kycImage) score += 10;
    if (form.orgName) score += 10;
    if (form.orgLogo) score += 5;
    if (form.orgTagline) score += 5;
    if (form.tournamentsOrganized) score += 5;
    if (form.hostingLevel) score += 5;
    if (form.tournamentsPerMonth) score += 5;
    if (form.games.length > 0) score += 10;
    if (form.formats.length > 0) score += 5;
    if (form.expectedParticipants) score += 5;
    if (form.prizePool) score += 5;
    const policyCount = Object.values(form.policies).filter(Boolean).length;
    score += policyCount * 2;
    return Math.min(score, 100);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    if (applicantNameAbuse || orgNameAbuse || orgMottoAbuse || orgDescAbuse) {
      alert('Cannot submit: one or more fields contain inappropriate words.');
      setSubmitting(false);
      return;
    }

    const policyKeys = ['fairPlay', 'antiCheat', 'refund', 'prizeDist', 'terms'];
    const allChecked = policyKeys.every(k => form.policies[k]);
    if (!allChecked) {
      alert('Please accept all policies to submit your application.');
      setSubmitting(false);
      return;
    }

    const experienceStr = [
      `Tournaments Organized: ${form.tournamentsOrganized || 'N/A'}`,
      `Hosting Level: ${form.hostingLevel || 'N/A'}`,
      `Monthly Tournaments: ${form.tournamentsPerMonth || 'N/A'}`,
      `Heard From: ${form.heardFrom || 'N/A'}${form.adSource ? ` (Ad: ${form.adSource})` : ''}`,
      `Age Group: ${form.ageGroup || 'N/A'}`,
      `ID: ${form.idType || 'N/A'}`,
    ].join(' | ');

    const newReq = {
      applicantName: form.applicantName,
      orgName: form.orgName,
      email: form.email,
      phone: form.phone,
      cityRegion: `Country: ${form.country} | State: ${form.state} | City: ${form.city}`,
      games: form.games.length > 0 ? form.games : ['All Games'],
      experience: experienceStr,
      orgImage: form.orgLogo,
      socialLinks: JSON.stringify({
        website: form.website,
        discord: form.discord,
        instagram: form.instagram,
        youtube: form.youtube,
        twitter: form.twitter,
      }),
      discordLink: form.discord || 'N/A',
      additionalNotes: `Tagline: ${form.orgTagline} | Description: ${form.orgDescription} | Formats: ${(form.formats || []).join(', ')} | Participants: ${form.expectedParticipants || 'N/A'} | Prize: ${form.prizePool || 'N/A'}`,
      kycDoc: `Doc Type: ${form.idType || 'N/A'} | File: ${form.kycImage || 'N/A'}`,
      portfolio: form.orgBanner || '',
      selectedPlan: 'Free',
    };

    try {
      const token = await getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/org/apply', {
        method: 'POST',
        headers,
        body: JSON.stringify(newReq),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAllApps(prev => [...prev, data.application]);
        setSubmitted(true);
        localStorage.removeItem(STORAGE_KEY);
        deleteDraftFromServer();
        if (currentUser) {
          currentUser.orgApplicationStatus = 'pending';
        }
      } else {
        alert(data.error || 'Failed to submit application.');
      }
    } catch (err) {
      alert('Server error. Please check your connection.');
    }
    setSubmitting(false);
  };

  const userApps = allApps.filter(app => app.email === currentUser?.email);
  const latestApp = userApps[userApps.length - 1];
  const isApproved = currentUser?.role === 'organiser' || latestApp?.status === 'approved';
  const isPending = !isApproved && (currentUser?.orgApplicationStatus === 'pending' || latestApp?.status === 'pending');

  let isRejected = false;
  let daysLeft = 0;
  if (!isApproved && !isPending && (currentUser?.orgApplicationStatus === 'rejected' || latestApp?.status === 'rejected')) {
    const rejTime = latestApp?.reviewed_at ? new Date(latestApp.reviewed_at).getTime() : Date.now();
    const daysPassed = (Date.now() - rejTime) / (1000 * 60 * 60 * 24);
    if (daysPassed < 7) {
      isRejected = true;
      daysLeft = Math.ceil(7 - daysPassed);
    }
  }

  const statesList = form.country ? Object.keys(locationData[form.country] || {}).sort((a, b) => a.localeCompare(b)) : [];
  const citiesList = (form.country && form.state) ? (locationData[form.country][form.state] || []) : [];
  const filteredCities = citiesList.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()));

  const orgImageInputRef = useRef(null);
  const kycInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const handleLogoUpload = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please upload a valid image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Logo must be under 5MB.'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      setCropImageSrc(reader.result);
      setCropImageName(file.name);
      setZoomPercent(100);
      setOffset({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const handleBannerUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please upload a valid image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('Banner must be under 10MB.'); return; }
    setIsUploadingBanner(true);
    try {
      const url = await uploadImage(file);
      if (url) {
        updateForm('orgBanner', url);
        updateForm('orgBannerName', file.name);
      }
    } catch {}
    setIsUploadingBanner(false);
  };

  const handleKycUpload = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) { alert('Please upload a valid document format (PDF, JPG, PNG).'); return; }
    const sizeMB = file.size / (1024 * 1024);
    const isValid = file.size <= 5 * 1024 * 1024;
    setKycFileInfo({ size: file.size, isValid, sizeText: sizeMB.toFixed(2) + ' MB' });
    if (!isValid) return;
    setIsUploadingKyc(true);
    try {
      const url = await uploadImage(file);
      if (url) {
        updateForm('kycImage', url);
        updateForm('kycName', file.name);
      }
    } catch {}
    setIsUploadingKyc(false);
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - offset.x, y: e.touches[0].clientY - offset.y });
    }
  };
  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    setOffset({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y });
  };

  const handleCropConfirm = () => {
    const img = new Image();
    img.src = cropImageSrc;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const containerSize = 256;
      const imgRatio = img.width / img.height;
      let renderW = containerSize, renderH = containerSize;
      if (imgRatio > 1) renderW = containerSize * imgRatio;
      else renderH = containerSize / imgRatio;
      const effZoom = zoomPercent / 100
      const zoomedW = renderW * effZoom;
      const zoomedH = renderH * effZoom;
      const scale = 512 / containerSize;
      const tx = ((containerSize - zoomedW) / 2 + offset.x) * scale;
      const ty = ((containerSize - zoomedH) / 2 + offset.y) * scale;
      ctx.fillStyle = '#07080C';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, tx, ty, zoomedW * scale, zoomedH * scale);
      const base64 = canvas.toDataURL('image/png');
      uploadCropped(base64);
    };
  };

  const uploadCropped = async (base64) => {
    setIsUploadingLogo(true);
    setCropImageSrc('');
    try {
      const url = await uploadImage(base64);
      if (url) {
        updateForm('orgLogo', url);
        updateForm('orgLogoName', cropImageName);
      }
    } catch {}
    setIsUploadingLogo(false);
  };

  const progress = Math.round((currentStep / 6) * 100);

  const renderDropdown = (label, value, options, onChange, placeholder, disabled) => (
    <div className="space-y-1.5">
      <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner cursor-pointer disabled:opacity-40"
          style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', backgroundImage: 'none' }}
        >
          <option value="">{placeholder || 'Select...'}</option>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
          <span className="material-symbols-outlined text-sm">expand_more</span>
        </span>
      </div>
    </div>
  );

  const renderMultiSelect = (label, options, selected, onChange) => (
    <div className="space-y-2">
      <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const isSel = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border ${
                isSel
                  ? 'bg-primary text-on-primary border-primary shadow-[0_0_10px_rgba(99,102,241,0.3)]'
                  : 'bg-surface-container border-outline-variant/40 text-on-surface-variant hover:text-white hover:border-primary/40'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderSectionBlock = (title, icon, children) => (
    <div className="glass-card p-5 rounded-2xl border border-outline-variant/20 bg-[#07080C]/30 backdrop-blur-sm space-y-4">
      <div className="flex items-center gap-2.5 pb-1 border-b border-outline-variant/10">
        <span className="material-symbols-outlined text-primary text-lg">{icon}</span>
        <h3 className="font-headline-md text-xs font-bold text-white uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-1.5">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Full Name *</label>
          <AbuseFieldWrapper fieldId="org-applicantName" value={form.applicantName} onWarning={setApplicantNameAbuse}>
            <input
              type="text"
              value={form.applicantName}
              onChange={(e) => updateForm('applicantName', e.target.value)}
              placeholder="Your full name"
              className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner"
            />
          </AbuseFieldWrapper>
        </div>

        <div className="space-y-1.5">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Phone Number *</label>
          <input
            type="text"
            inputMode="numeric"
            value={form.phone}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
              updateForm('phone', val);
            }}
            placeholder="10-digit mobile number"
            className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {renderDropdown('Country *', form.country, countriesList, (v) => {}, 'India', true)}

        {renderDropdown('State *', form.state, statesList, (v) => { updateForm('state', v); updateForm('city', ''); }, 'Select state', false)}

        <div className="space-y-1.5 relative">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">District *</label>
          <div className="relative">
            <input
              type="text"
              placeholder={form.state ? 'Search district...' : 'Select state first'}
              disabled={!form.state}
              value={form.city || citySearch}
              onChange={(e) => { setCitySearch(e.target.value); updateForm('city', e.target.value); setShowCityDropdown(true); }}
              onFocus={() => { if (form.state) setShowCityDropdown(true); }}
              className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner disabled:opacity-40"
            />
            {form.city && (
              <button type="button" onClick={() => { updateForm('city', ''); setCitySearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-white">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
            {showCityDropdown && filteredCities.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-surface-container border border-outline-variant/50 rounded-xl z-20 shadow-xl custom-scrollbar">
                {filteredCities.map((c) => (
                  <div key={c} onClick={() => { updateForm('city', c); setCitySearch(''); setShowCityDropdown(false); }}
                    className="px-4 py-2.5 text-xs text-white hover:bg-primary/20 cursor-pointer transition-colors">{c}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderDropdown('Age Group *', form.ageGroup, ageGroups, (v) => updateForm('ageGroup', v))}
        {renderDropdown('Government ID Type *', form.idType, idTypes, (v) => updateForm('idType', v))}
      </div>

      <div className="space-y-2">
        <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Upload Government ID *</label>
        <input ref={kycInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleKycUpload(e.target.files?.[0])} />
        {!form.kycImage ? (
          <div onClick={() => kycInputRef.current?.click()} className="border border-dashed border-outline-variant/40 hover:border-primary/40 bg-surface-container-high/10 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors">
            {isUploadingKyc ? (
              <div className="flex items-center gap-2 py-1">
                <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <span className="text-xs text-primary font-bold">Uploading...</span>
              </div>
            ) : (
              <>
                <span className="material-symbols-outlined text-primary text-xl">cloud_upload</span>
                <div className="text-center">
                  <p className="text-xs text-white font-semibold">Upload ID Scan (PDF, JPG, PNG)</p>
                  <p className="text-[9px] text-on-surface-variant mt-0.5">Max 5MB</p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/50 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="material-symbols-outlined text-primary text-lg shrink-0">draft</span>
              <span className="font-semibold text-white truncate">{form.kycName || 'document.pdf'}</span>
              <span className={`text-[10px] font-bold ${kycFileInfo.isValid ? 'text-emerald-400' : 'text-red-400'}`}>
                {kycFileInfo.sizeText}
              </span>
            </div>
            <button type="button" onClick={() => { updateForm('kycImage', ''); updateForm('kycName', ''); setKycFileInfo({ size: 0, isValid: true, sizeText: '' }); }}
              className="w-7 h-7 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-red-400 flex items-center justify-center transition-colors shrink-0">
              <span className="material-symbols-outlined text-base">delete</span>
            </button>
          </div>
        )}

        <p className="flex items-start gap-1.5 text-[10px] text-amber-400/80 font-medium mt-1">
          <span className="text-amber-400 font-bold leading-none mt-px">*</span>
          <span>Uploading the government ID is needed, both front and back side.</span>
        </p>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Organization Name *</label>
          <AbuseFieldWrapper fieldId="org-orgName" value={form.orgName} onWarning={setOrgNameAbuse}>
            <input
              type="text"
              value={form.orgName}
              onChange={(e) => updateForm('orgName', e.target.value)}
              placeholder="e.g. Nexus Gaming Guild"
              className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner"
            />
          </AbuseFieldWrapper>
        </div>

        <div className="space-y-1.5">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Organization Logo (512×512) *</label>
          <input ref={orgImageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e.target.files?.[0])} />
          {form.orgLogo ? (
            <div className="p-2 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 overflow-hidden pr-2">
                <span className="material-symbols-outlined text-primary text-lg">image</span>
                <span className="font-semibold text-white truncate text-[11px]">{form.orgLogoName || 'logo.png'}</span>
              </div>
              <button type="button" onClick={() => { updateForm('orgLogo', ''); updateForm('orgLogoName', ''); }}
                className="w-6 h-6 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-red-400 flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          ) : (
            <div onClick={() => orgImageInputRef.current?.click()}
              className="border border-dashed border-outline-variant/40 hover:border-primary/40 bg-surface-container-high/10 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors">
              {isUploadingLogo ? (
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                  <span className="text-[11px] text-primary font-bold">Uploading...</span>
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-primary text-lg">cloud_upload</span>
                  <span className="text-[11px] text-white font-semibold">Upload Logo (Max 5MB)</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Organization Banner</label>
          <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleBannerUpload(e.target.files?.[0])} />
          {form.orgBanner ? (
            <div className="p-2 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 overflow-hidden pr-2">
                <span className="material-symbols-outlined text-primary text-lg">photo</span>
                <span className="font-semibold text-white truncate text-[11px]">{form.orgBannerName || 'banner.png'}</span>
              </div>
              <button type="button" onClick={() => { updateForm('orgBanner', ''); updateForm('orgBannerName', ''); }}
                className="w-6 h-6 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-red-400 flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          ) : (
            <div onClick={() => bannerInputRef.current?.click()}
              className="border border-dashed border-outline-variant/40 hover:border-primary/40 bg-surface-container-high/10 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors">
              {isUploadingBanner ? (
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                  <span className="text-[11px] text-primary font-bold">Uploading...</span>
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-primary text-lg">wallpaper</span>
                  <span className="text-[11px] text-white font-semibold">Upload Banner (Max 10MB)</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Organization Tagline *</label>
        <AbuseFieldWrapper fieldId="org-motto" value={form.orgTagline} onWarning={setOrgMottoAbuse}>
          <input
            type="text"
            value={form.orgTagline}
            onChange={(e) => updateForm('orgTagline', e.target.value)}
            placeholder="e.g. Elevating Competitive Gaming"
            className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner"
          />
        </AbuseFieldWrapper>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Organization Description</label>
          <span className="text-[9px] text-on-surface-variant/50 font-medium italic">Optional</span>
        </div>
        <AbuseFieldWrapper fieldId="org-description" value={form.orgDescription} onWarning={setOrgDescAbuse}>
          <textarea
            rows={3}
            value={form.orgDescription}
            onChange={(e) => updateForm('orgDescription', e.target.value)}
            placeholder="Describe your organization's mission, history, and goals..."
            className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm resize-none outline-none focus:border-primary/60 transition-all shadow-inner"
          />
        </AbuseFieldWrapper>
        <p className="text-[9px] text-on-surface-variant/50">Can be edited later from Organization Settings</p>
      </div>

      <div className="glass-card p-4 rounded-xl border border-primary/10 bg-primary/[0.02] backdrop-blur-sm space-y-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-sm">link</span>
          <h4 className="font-headline-md text-xs font-bold text-white uppercase tracking-wider">Social Links</h4>
          <span className="text-[9px] text-on-surface-variant/50 font-medium italic">Optional</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[9px] text-on-surface-variant/70 font-semibold">Website</label>
            <input type="url" value={form.website} onChange={(e) => updateForm('website', e.target.value)} placeholder="https://yourorg.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 text-white text-xs outline-none focus:border-primary/60 transition-all shadow-inner" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-on-surface-variant/70 font-semibold">Discord Server</label>
            <input type="url" value={form.discord} onChange={(e) => updateForm('discord', e.target.value)} placeholder="https://discord.gg/..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 text-white text-xs outline-none focus:border-primary/60 transition-all shadow-inner" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-on-surface-variant/70 font-semibold">Instagram</label>
            <input type="text" value={form.instagram} onChange={(e) => updateForm('instagram', e.target.value)} placeholder="@yourorg"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 text-white text-xs outline-none focus:border-primary/60 transition-all shadow-inner" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-on-surface-variant/70 font-semibold">YouTube</label>
            <input type="text" value={form.youtube} onChange={(e) => updateForm('youtube', e.target.value)} placeholder="Channel name or URL"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 text-white text-xs outline-none focus:border-primary/60 transition-all shadow-inner" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-on-surface-variant/70 font-semibold">X (Twitter)</label>
            <input type="text" value={form.twitter} onChange={(e) => updateForm('twitter', e.target.value)} placeholder="@yourorg"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 text-white text-xs outline-none focus:border-primary/60 transition-all shadow-inner" />
          </div>
        </div>
      </div>

      <div className="pt-2">
        <div className="glass-card p-4 rounded-xl border border-outline-variant/40 bg-gradient-to-r from-primary/[0.04] via-surface-container-high/30 to-secondary/[0.02] backdrop-blur-md flex items-center gap-4 relative overflow-hidden shadow-lg">
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-primary/20 rounded-full blur-xl pointer-events-none"></div>
          <div className="w-14 h-14 rounded-xl border border-outline-variant/40 bg-surface-container overflow-hidden shrink-0 shadow-md">
            {form.orgLogo ? (
              <img src={form.orgLogo} alt="Logo preview" className="avatar-img" />
          ) : (
            <span className="material-symbols-outlined text-on-surface-variant/40 text-2xl">business</span>
          )}
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-headline-md text-xs sm:text-sm font-bold text-white tracking-tight truncate max-w-[180px] sm:max-w-[240px]">
              {form.orgName.trim() || 'Your Organization'}
            </h4>
            <span className="material-symbols-outlined text-[15px] text-[#1d9bf0] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
          </div>
          <p className="font-body-sm text-[10px] text-on-surface-variant">{form.orgTagline || 'Tagline here'}</p>
          <div className="flex gap-2 text-[9px] font-bold text-primary-light mt-0.5">
            <span>Accredited Tournament Host</span>
            <span>•</span>
            <span>Status: Verified</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

  const renderStep3 = () => (
    <div className="space-y-5">
      {renderDropdown('How many tournaments have you organized?', form.tournamentsOrganized, tournamentsOrg, (v) => updateForm('tournamentsOrganized', v))}
      {renderDropdown('Hosting Experience Level', form.hostingLevel, expLevels, (v) => updateForm('hostingLevel', v))}
      {renderDropdown('Expected Tournaments Per Month', form.tournamentsPerMonth, monthlyTourneys, (v) => updateForm('tournamentsPerMonth', v))}

      <div className="space-y-1.5">
        <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">How did you hear about Match District?</label>
        <div className="relative">
          <select
            value={form.heardFrom}
            onChange={(e) => updateForm('heardFrom', e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner cursor-pointer"
            style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', backgroundImage: 'none' }}
          >
            <option value="">Select...</option>
            {hearAbout.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
            <span className="material-symbols-outlined text-sm">expand_more</span>
          </span>
        </div>
      </div>

      {form.heardFrom === 'Advertisement' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-1.5 pl-4 border-l-2 border-primary/30"
        >
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">Where did you see the advertisement?</label>
          <div className="relative">
            <select
              value={form.adSource}
              onChange={(e) => updateForm('adSource', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/50 text-white text-xs sm:text-sm outline-none focus:border-primary/60 transition-all shadow-inner cursor-pointer"
              style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', backgroundImage: 'none' }}
            >
              <option value="">Select...</option>
              {adSources.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
              <span className="material-symbols-outlined text-sm">expand_more</span>
            </span>
          </div>
        </motion.div>
      )}

      <div className="glass-card p-4 rounded-xl border border-outline-variant/20 bg-primary/[0.02] backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary text-sm">insights</span>
          <span className="text-[10px] text-on-surface-variant font-semibold">Your Organizer Profile Strength</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500" style={{ width: `${Math.min(40 + (form.tournamentsOrganized ? 15 : 0) + (form.hostingLevel ? 15 : 0) + (form.tournamentsPerMonth ? 15 : 0) + (form.heardFrom ? 15 : 0), 100)}%` }} />
          </div>
          <span className="text-xs font-bold text-white">{Math.min(40 + (form.tournamentsOrganized ? 15 : 0) + (form.hostingLevel ? 15 : 0) + (form.tournamentsPerMonth ? 15 : 0) + (form.heardFrom ? 15 : 0), 100)}%</span>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-5">
      {renderMultiSelect('Games Planned *', gameOptions, form.games, (opt) => toggleArrayItem('games', opt))}

      {renderMultiSelect('Tournament Formats', formatOptions, form.formats, (opt) => toggleArrayItem('formats', opt))}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderDropdown('Expected Participants Per Event', form.expectedParticipants, participantRanges, (v) => updateForm('expectedParticipants', v))}
        {renderDropdown('Prize Pool Range', form.prizePool, prizeRanges, (v) => updateForm('prizePool', v))}
      </div>

      {form.games.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-emerald-400 text-sm">checklist</span>
            <span className="text-[10px] text-emerald-400 font-semibold">Games Selected</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {form.games.map(g => (
              <span key={g} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 font-semibold">{g}</span>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );

  const renderStep5 = () => {
    const policyItems = [
      { key: 'fairPlay', label: 'Fair Play Policy', desc: 'I agree to uphold fair competition standards and ensure all matches are conducted with integrity.' },
      { key: 'antiCheat', label: 'Anti-Cheating Rules', desc: 'I agree to enforce anti-cheating measures and report any suspicious activity to Match District.' },
      { key: 'refund', label: 'Refund Policy', desc: 'I acknowledge and agree to the platform refund and cancellation policies.' },
      { key: 'prizeDist', label: 'Prize Distribution Policy', desc: 'I agree to distribute prizes fairly and in accordance with the tournament rules.' },
      { key: 'terms', label: 'Match District Terms & Conditions', desc: 'I have read and agree to the Match District Terms & Conditions and Privacy Policy.' },
    ];

    const score = getTrustScore();

    return (
      <div className="space-y-5">
        <div className="glass-card p-5 rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-500/[0.03] to-transparent backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-lg">security</span>
              <h3 className="font-headline-md text-xs font-bold text-white uppercase tracking-wider">Organizer Trust Score</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-surface-container rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 via-primary to-emerald-400 rounded-full transition-all duration-700" style={{ width: `${score}%` }} />
              </div>
              <span className={`text-sm font-extrabold ${score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-primary' : 'text-amber-400'}`}>{score}%</span>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {[20, 40, 60, 80, 100].map((t) => (
              <div key={t} className={`text-center text-[8px] font-bold uppercase tracking-wider ${score >= t ? 'text-primary' : 'text-on-surface-variant/40'}`}>
                <span className={`block w-full h-1 rounded-full mb-1 ${score >= t ? 'bg-primary/30' : 'bg-surface-container'}`} />
                {t === 100 ? 'Excellent' : t === 80 ? 'Strong' : t === 60 ? 'Good' : t === 40 ? 'Fair' : 'Basic'}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {policyItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => updatePolicy(item.key)}
              className={`w-full flex items-start gap-3.5 p-4 rounded-xl border transition-all text-left ${
                form.policies[item.key]
                  ? 'bg-primary/[0.06] border-primary/40 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                  : 'bg-surface-container border-outline-variant/30 hover:border-outline-variant/60'
              }`}
            >
              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                form.policies[item.key]
                  ? 'bg-primary text-on-primary shadow-[0_0_8px_rgba(99,102,241,0.3)]'
                  : 'bg-surface-container-high border border-outline-variant/50'
              }`}>
                {form.policies[item.key] && <span className="material-symbols-outlined text-[10px]">check</span>}
              </div>
              <div className="min-w-0">
                <span className={`font-headline-md text-xs font-bold transition-colors ${form.policies[item.key] ? 'text-white' : 'text-on-surface-variant'}`}>
                  {item.label}
                </span>
                <p className="font-body-sm text-[10px] text-on-surface-variant/70 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderStep6 = () => {
    const sections = [
      {
        title: 'Personal Details',
        icon: 'verified_user',
        items: [
          { label: 'Full Name', value: form.applicantName },
          { label: 'Email', value: form.email },
          { label: 'Phone', value: form.phone },
          { label: 'Location', value: `${form.city}, ${form.state}, ${form.country}` },
          { label: 'Age Group', value: form.ageGroup },
          { label: 'ID Type', value: form.idType },
        ]
      },
      {
        title: 'Organization Details',
        icon: 'workspaces',
        items: [
          { label: 'Name', value: form.orgName },
          { label: 'Tagline', value: form.orgTagline },
          { label: 'Description', value: form.orgDescription || '\u2014' },
          { label: 'Website', value: form.website || '\u2014' },
          { label: 'Discord', value: form.discord || '\u2014' },
        ]
      },
      {
        title: 'Experience',
        icon: 'trending_up',
        items: [
          { label: 'Tournaments Organized', value: form.tournamentsOrganized || '\u2014' },
          { label: 'Experience Level', value: form.hostingLevel || '\u2014' },
          { label: 'Tournaments Per Month', value: form.tournamentsPerMonth || '\u2014' },
          { label: 'Heard From', value: form.heardFrom || '\u2014' },
        ]
      },
      {
        title: 'Tournament Plans',
        icon: 'sports_esports',
        items: [
          { label: 'Games', value: form.games.length > 0 ? form.games.join(', ') : '\u2014' },
          { label: 'Formats', value: form.formats.length > 0 ? form.formats.join(', ') : '\u2014' },
          { label: 'Participants', value: form.expectedParticipants || '\u2014' },
          { label: 'Prize Pool', value: form.prizePool || '\u2014' },
        ]
      },
    ];

    return (
      <div className="space-y-5">
        {sections.map((section, idx) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="glass-card p-4 rounded-xl border border-outline-variant/20 bg-[#07080C]/30 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-outline-variant/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">{section.icon}</span>
                <h3 className="font-headline-md text-[11px] font-bold text-white uppercase tracking-wider">{section.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => jumpToStep(idx + 1)}
                className="text-[10px] text-primary hover:text-primary/80 font-semibold flex items-center gap-0.5 transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">edit</span>
                Edit
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {section.items.map((item) => (
                <div key={item.label} className="flex justify-between sm:flex-col gap-1 py-0.5">
                  <span className="text-[9px] text-on-surface-variant/60 uppercase tracking-wider font-semibold">{item.label}</span>
                  <span className="text-[11px] text-white font-semibold truncate">{item.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}

        {form.orgLogo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant/20">
            <div className="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant/30 bg-surface-container shrink-0">
              <img src={form.orgLogo} alt="Org logo" className="avatar-img" />
            </div>
            <div className="text-[10px] text-on-surface-variant">
              <span className="text-white font-semibold">{form.orgLogoName || 'Logo'}</span>
              <span className="block text-[9px]">Organization logo uploaded</span>
            </div>
          </motion.div>
        )}

        <div className="glass-card p-4 rounded-xl border border-amber-500/20 bg-gradient-to-b from-amber-500/[0.03] to-transparent backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-on-surface-variant font-semibold">Trust Score</span>
            <span className="text-sm font-extrabold text-emerald-400">{getTrustScore()}%</span>
          </div>
          <div className="h-2 bg-surface-container rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 via-primary to-emerald-400 rounded-full transition-all duration-700" style={{ width: `${getTrustScore()}%` }} />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3.5 min-h-[44px] bg-gradient-to-r from-primary to-indigo-500 text-on-primary rounded-xl font-headline-md text-xs font-bold transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              Submitting...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">rocket_launch</span>
              Submit Application
            </>
          )}
        </button>
      </div>
    );
  };

  const renderPostSubmission = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-6 sm:p-10 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.04] to-transparent space-y-6 shadow-xl max-w-lg mx-auto"
    >
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        </div>
        <div className="space-y-1">
          <h2 className="font-display-lg text-lg sm:text-xl font-extrabold text-white uppercase tracking-tight">Application Submitted!</h2>
          <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed">
            Thank you for applying. Our team will review your application and notify you once your Organizer Portal is activated.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-emerald-400 text-sm">check</span>
          </div>
          <div>
            <p className="text-xs text-white font-bold">Application Submitted</p>
            <p className="text-[10px] text-emerald-400/70">Your application is in our system</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-amber-400 text-sm">hourglass_empty</span>
          </div>
          <div>
            <p className="text-xs text-white font-bold">Under Review</p>
            <p className="text-[10px] text-amber-400/70">Our team is evaluating your details</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant/30 opacity-60">
          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-surface-variant text-sm">gavel</span>
          </div>
          <div>
            <p className="text-xs text-white font-bold">Verification</p>
            <p className="text-[10px] text-on-surface-variant/70">Identity & document verification</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant/30 opacity-60">
          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-surface-variant text-sm">rocket_launch</span>
          </div>
          <div>
            <p className="text-xs text-white font-bold">Organizer Activation</p>
            <p className="text-[10px] text-on-surface-variant/70">Portal access granted</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/[0.04] to-secondary/[0.02] backdrop-blur-sm text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="material-symbols-outlined text-primary text-sm">schedule</span>
          <span className="text-xs text-white font-bold">Estimated Review Time</span>
        </div>
        <p className="text-lg font-extrabold text-primary">24\u201372 Hours</p>
      </div>

      <button
        onClick={() => onNavigate && onNavigate('home')}
        className="w-full py-3 min-h-[44px] bg-surface-container-high border border-outline-variant/40 text-white rounded-xl font-headline-md text-xs font-bold hover:bg-surface-variant transition-all"
      >
        Return Home
      </button>
    </motion.div>
  );

  const renderPendingView = () => (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-6 sm:p-10 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent space-y-6 shadow-xl">
      <div className="text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-2xl">hourglass_empty</span>
        </div>
        <div className="space-y-1">
          <h2 className="font-display-lg text-lg sm:text-xl font-bold text-white uppercase tracking-tight">Application Under Review</h2>
          <p className="font-body-md text-xs sm:text-sm text-amber-300/80 leading-relaxed font-semibold">
            Your organizer application has been submitted and is currently pending admin review.
          </p>
        </div>
      </div>
      <button onClick={() => onNavigate && onNavigate('home')}
        className="w-full py-3 min-h-[44px] bg-surface-container-high border border-outline-variant/40 text-white rounded-xl font-headline-md text-xs font-bold">
        Return Home
      </button>
    </motion.div>
  );

  const renderRejectedView = () => (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-6 sm:p-10 rounded-2xl border border-rose-500/30 bg-gradient-to-b from-rose-500/5 to-transparent text-center space-y-5 shadow-xl">
      <div className="w-14 h-14 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined text-2xl">block</span>
      </div>
      <div className="space-y-1">
        <h2 className="font-display-lg text-lg sm:text-xl font-bold text-white uppercase">Accreditation Not Approved</h2>
        <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed">Submission details did not pass verification criteria.</p>
        <p className="text-xs text-rose-400 font-semibold pt-1">You can reapply in <strong>{daysLeft} days</strong>.</p>
      </div>
      <button onClick={() => onNavigate && onNavigate('home')}
        className="w-full py-3 min-h-[44px] bg-surface-container-high border border-outline-variant/40 text-white rounded-xl font-headline-md text-xs font-bold">
        Return Home
      </button>
    </motion.div>
  );

  const renderStepNav = () => (
    <div className="flex items-center justify-between w-full mb-6 pb-1">
      {STEPS.map((step) => {
        const isActive = currentStep === step.id;
        const isDone = currentStep > step.id;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => { if (isDone) jumpToStep(step.id); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all text-[10px] font-bold uppercase tracking-wider ${
              isActive
                ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                : isDone
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-pointer'
                  : 'bg-surface-container text-on-surface-variant/50 border border-outline-variant/20'
            }`}
          >
            {isDone ? (
              <span className="material-symbols-outlined text-[10px]">check</span>
            ) : (
              <span>{step.id}</span>
            )}
            <span className="hidden sm:inline">{step.title}</span>
          </button>
        );
      })}
    </div>
  );

  const renderWizard = () => (
    <>
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-lg">{STEPS[currentStep - 1]?.icon}</span>
            <div>
              <h3 className="font-headline-md text-sm font-bold text-white">{STEPS[currentStep - 1]?.title}</h3>
              <p className="text-[10px] text-on-surface-variant">{STEPS[currentStep - 1]?.subtitle}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-on-surface-variant/60">Step {currentStep} of 6</p>
          </div>
        </div>
        <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary via-indigo-400 to-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
        {renderStepNav()}
      </div>

      <div className="glass-card p-5 sm:p-6 rounded-2xl border border-outline-variant/10 bg-[#07080C]/40 backdrop-blur-2xl shadow-xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
            {currentStep === 5 && renderStep5()}
            {currentStep === 6 && renderStep6()}
          </motion.div>
        </AnimatePresence>

        {currentStep < 6 && (
          <div className="flex gap-3 mt-6 pt-5 border-t border-outline-variant/10">
            {currentStep > 1 ? (
              <button type="button" onClick={handleBack}
                className="flex-1 py-3 min-h-[44px] bg-surface-container-high text-on-surface-variant hover:text-white rounded-xl font-headline-md text-xs font-bold border border-outline-variant/30 transition-all flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                Back
              </button>
            ) : <div className="flex-1" />}
            <button type="button" onClick={handleNext}
              className="flex-1 py-3 min-h-[44px] bg-primary text-on-primary rounded-xl font-headline-md text-xs font-bold transition-all shadow-[0_0_12px_rgba(99,102,241,0.2)] hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] flex items-center justify-center gap-1.5">
              Next
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#07080C] text-on-background relative overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[250px] sm:w-[600px] h-[250px] sm:h-[600px] bg-primary/10 blur-[80px] sm:blur-[130px] rounded-full animate-pulse duration-[12s] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-secondary/8 blur-[70px] sm:blur-[100px] rounded-full animate-pulse duration-[9s] delay-[3s] pointer-events-none"></div>
      </div>

      <main className="w-full max-w-3xl mx-auto px-4 pt-20 sm:pt-28 pb-8 sm:pb-14 relative z-10">
        {!submitted && !isPending && !isRejected && resumeAvailable && currentStep === 1 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-4 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/[0.06] to-secondary/[0.02] backdrop-blur-sm flex items-center justify-between gap-4 mb-6"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-lg">history</span>
              <div>
                <p className="text-xs text-white font-bold">Resume your application?</p>
                <p className="text-[10px] text-on-surface-variant">You have a saved draft from your previous session.</p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={clearDraft}
                className="px-3 py-1.5 text-[10px] text-on-surface-variant hover:text-red-400 font-semibold border border-outline-variant/30 rounded-lg transition-colors">
                Discard
              </button>
              <button type="button" onClick={resumeDraft}
                className="px-3 py-1.5 min-h-[44px] text-[10px] bg-primary text-on-primary font-bold rounded-lg shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all">
                Resume
              </button>
            </div>
          </motion.div>
        )}

        {isPending ? renderPendingView() : isRejected ? renderRejectedView() : (
          submitted ? renderPostSubmission() : renderWizard()
        )}
      </main>

      {cropImageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass-card border border-outline-variant/60 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 relative bg-[#07080C]/90 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
              <h3 className="font-headline-md text-sm font-bold text-white flex items-center gap-2 tracking-tight">
                <span className="material-symbols-outlined text-primary text-lg">crop_free</span> Crop Organization Logo
              </h3>
              <button onClick={() => { setCropImageSrc(''); setCropImageName(''); }}
                className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface-variant hover:text-white flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
            <p className="text-[10px] text-on-surface-variant/90 leading-normal">Organizers require a 512x512 logo. Drag to pan and use the slider below to zoom.</p>
            <div className="relative w-56 sm:w-64 h-56 sm:h-64 mx-auto rounded-xl border border-outline-variant/50 overflow-hidden bg-black/40 select-none touch-none">
              <div className="absolute inset-0 z-10 border-2 border-primary/50 pointer-events-none rounded-xl" style={{ boxShadow: '0 0 0 9999px rgba(7, 8, 12, 0.7)' }} />
              <div className="w-full h-full cursor-move"
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleMouseUp}>
                <img src={cropImageSrc} alt="Crop preview" draggable={false} className="max-w-none origin-center select-none"
                  style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoomPercent / 100})`, transition: isDragging ? 'none' : 'transform 0.1s ease-out', width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                <span>Zoom</span>
                <span>{zoomPercent}%</span>
              </div>
              <input type="range" min="10" max="200" step="1" value={zoomPercent} onChange={(e) => setZoomPercent(Number(e.target.value))}
                className="w-full h-1 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setCropImageSrc(''); setCropImageName(''); }}
                className="flex-1 py-2.5 min-h-[44px] bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-white rounded-xl font-headline-md text-xs font-bold border border-outline-variant/30 transition-all">
                Cancel
              </button>
              <button type="button" onClick={handleCropConfirm}
                className="flex-1 py-2.5 min-h-[44px] bg-primary text-on-primary rounded-xl font-headline-md text-xs font-bold transition-all shadow-[0_0_12px_rgba(192,193,255,0.2)]">
                Crop & Save
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

export default OrganizerForm;
