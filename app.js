require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

async function start() {
const SQL = await initSqlJs();
class PersistentDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.dirty = false;
    this.transactionDepth = 0;
    const bytes = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
    this.raw = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
  }
  persist() {
    if (this.transactionDepth > 0) { this.dirty = true; return; }
    fs.writeFileSync(this.filePath, Buffer.from(this.raw.export()));
    this.dirty = false;
  }
  pragma(value) {
    try { this.raw.run('PRAGMA ' + value); } catch (_) {}
  }
  exec(sql) { this.raw.exec(sql); this.persist(); }
  prepare(sql) {
    const owner = this;
    return {
      run(...params) {
        owner.raw.run(sql, params);
        const changes = owner.raw.getRowsModified();
        let lastInsertRowid = 0;
        try { lastInsertRowid = owner.raw.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] || 0; } catch (_) {}
        owner.persist();
        return { changes, lastInsertRowid };
      },
      get(...params) {
        const stmt = owner.raw.prepare(sql);
        try {
          if (params.length) stmt.bind(params);
          return stmt.step() ? stmt.getAsObject() : undefined;
        } finally { stmt.free(); }
      },
      all(...params) {
        const stmt = owner.raw.prepare(sql);
        const rows = [];
        try {
          if (params.length) stmt.bind(params);
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        } finally { stmt.free(); }
      }
    };
  }
  transaction(fn) {
    const owner = this;
    return function(...args) {
      owner.raw.run('BEGIN');
      owner.transactionDepth++;
      try {
        const result = fn.apply(this, args);
        owner.transactionDepth--;
        owner.raw.run('COMMIT');
        if (owner.dirty) owner.persist();
        return result;
      } catch (error) {
        owner.transactionDepth--;
        try { owner.raw.run('ROLLBACK'); } catch (_) {}
        owner.dirty = false;
        throw error;
      }
    };
  }
}
const app = express();

if(process.env.NODE_ENV==='production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length<32)) {
  throw new Error('Set SESSION_SECRET to a random value of at least 32 characters in production.');
}
const PORT = process.env.PORT || 3000;
const baseUrl = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const dataDir = path.resolve(path.dirname(process.env.DATABASE_PATH || './data/journey-masterz.sqlite'));
fs.mkdirSync(dataDir, {recursive:true});
fs.mkdirSync(path.join(__dirname,'public/uploads'), {recursive:true});
const dbPath = path.resolve(process.env.DATABASE_PATH || './data/journey-masterz.sqlite');
fs.mkdirSync(path.dirname(dbPath), {recursive:true});
const db = new PersistentDatabase(dbPath);
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname,'public/uploads'));
fs.mkdirSync(uploadsDir, {recursive:true});
const sessionsDir = path.resolve(process.env.SESSIONS_DIR || path.join(path.dirname(dbPath),'sessions'));
fs.mkdirSync(sessionsDir, {recursive:true});
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS destinations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, region TEXT NOT NULL, summary TEXT DEFAULT '', image TEXT DEFAULT '', highlights TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'published', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS packages (id INTEGER PRIMARY KEY, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, destination TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Domestic Holidays', duration TEXT NOT NULL DEFAULT 'Request details', season TEXT DEFAULT 'Confirm season', image TEXT DEFAULT '', summary TEXT DEFAULT '', itinerary TEXT DEFAULT '', inclusions TEXT DEFAULT '', exclusions TEXT DEFAULT '', price TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'published', featured INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS enquiries (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT DEFAULT '', travel_date TEXT DEFAULT '', travellers TEXT DEFAULT '', destination TEXT DEFAULT '', message TEXT DEFAULT '', status TEXT DEFAULT 'New', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS faqs (id INTEGER PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, status TEXT DEFAULT 'published');
`);
function slugify(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'trip';}
function safe(v,max=5000){return String(v??'').trim().slice(0,max);}
const imageMap = {
  'Himachal Pradesh':'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=1200&q=80',
  'Uttarakhand':'https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?auto=format&fit=crop&w=1200&q=80',
  'Kashmir':'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?auto=format&fit=crop&w=1200&q=80',
  'Rajasthan':'https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=1200&q=80',
  'South India':'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1200&q=80',
  'Kerala':'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1200&q=80',
  'Goa':'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80',
  'Ladakh':'https://images.unsplash.com/photo-1566837497312-7be4f6c6b5d6?auto=format&fit=crop&w=1200&q=80',
  'North East India':'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1200&q=80',
  'Punjab':'https://images.unsplash.com/photo-1588096344356-3b1f4e4d6c6a?auto=format&fit=crop&w=1200&q=80',
  'Andaman Islands':'https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=1200&q=80',
  'Uttar Pradesh':'https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=1200&q=80',
  'Madhya Pradesh':'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1200&q=80',
  'Gujarat':'https://images.unsplash.com/photo-1514222134-b57cbb8ce073?auto=format&fit=crop&w=1200&q=80',
  'Maharashtra':'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=1200&q=80',
  'Tamil Nadu':'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=1200&q=80',
  'Karnataka':'https://images.unsplash.com/photo-1600100397608-f010d3f5a2a8?auto=format&fit=crop&w=1200&q=80',
  'Odisha':'https://images.unsplash.com/photo-1609948543911-1f5c2b9e5b3b?auto=format&fit=crop&w=1200&q=80',
  'Bihar':'https://images.unsplash.com/photo-1592639296346-560c37a0f711?auto=format&fit=crop&w=1200&q=80',
  'default':'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80'
};
const destinationSeeds = [
['Himachal Pradesh','North India','Mountain escapes from Shimla and Manali to Spiti and Tirthan Valley.','Shimla, Manali, Kasol, Kullu, Dharamshala, Dalhousie, Spiti Valley, Kinnaur'],
['Uttarakhand','North India','Himalayan hill towns, nature retreats, wildlife and pilgrimage routes.','Mussoorie, Nainital, Rishikesh, Haridwar, Auli, Chopta, Char Dham'],
['Kashmir','North India','Lakes, gardens, mountain valleys and seasonal snow experiences.','Srinagar, Gulmarg, Pahalgam, Sonamarg, Doodhpathri, Gurez Valley'],
['Rajasthan','West India','Palaces, forts, desert landscapes, heritage towns and wildlife.','Jaipur, Udaipur, Jodhpur, Jaisalmer, Pushkar, Ranthambore'],
['South India','South India','A varied circuit of backwaters, beaches, temples, hills and heritage.','Kerala, Tamil Nadu, Karnataka, Andhra Pradesh, Telangana'],
['Kerala','South India','Backwaters, tea gardens, forest retreats and Arabian Sea beaches.','Munnar, Alleppey, Thekkady, Kochi, Wayanad, Varkala'],
['Ladakh','North India','High-altitude scenery, monasteries and dramatic Himalayan road trips.','Leh, Nubra Valley, Pangong Lake, Tso Moriri'],
['North East India','North East India','Waterfalls, tea country, mountain culture and biodiverse landscapes.','Sikkim, Darjeeling, Meghalaya, Assam, Arunachal Pradesh, Nagaland'],
['Goa','West India','Coastal breaks, heritage quarters, local cuisine and beach time.','North Goa, South Goa, Panaji, Old Goa'],
['Punjab and Chandigarh','North India','Sikh heritage, Punjabi culture, food and relaxed city breaks.','Amritsar, Anandpur Sahib, Chandigarh, Patiala'],
['Uttar Pradesh','North India','Spiritual cities, historic landmarks and living cultural traditions.','Varanasi, Ayodhya, Mathura, Vrindavan, Prayagraj, Agra'],
['Madhya Pradesh','Central India','Wildlife, ancient temples, heritage and central Indian landscapes.','Ujjain, Omkareshwar, Khajuraho, Bhopal, Kanha'],
['Gujarat','West India','Coastal heritage, sacred sites, wildlife and distinctive landscapes.','Dwarka, Somnath, Kutch, Ahmedabad, Gir'],
['Maharashtra','West India','Mumbai city breaks, hill stations, caves and pilgrimage destinations.','Mumbai, Lonavala, Mahabaleshwar, Shirdi, Ajanta'],
['Tamil Nadu','South India','Temple towns, coastal scenery and southern hill stations.','Ooty, Kodaikanal, Madurai, Rameswaram, Kanyakumari, Chennai'],
['Karnataka','South India','Coffee hills, royal heritage, coast and ancient architecture.','Mysuru, Coorg, Hampi, Gokarna, Bengaluru, Chikmagalur'],
['Andhra Pradesh','South India','Temple journeys, coastlines and green hill escapes.','Tirupati, Visakhapatnam, Araku Valley, Gandikota'],
['Telangana','South India','Historic Hyderabad and temple, lake and fort experiences.','Hyderabad, Warangal, Yadadri, Bhadrachalam'],
['Odisha','East India','Temple architecture, coastal culture and historic cities.','Puri, Bhubaneswar, Konark, Chilika Lake'],
['West Bengal','East India','Tea gardens, Himalayan towns, cultural Kolkata and coastal escapes.','Darjeeling, Kolkata, Kalimpong, Sundarbans'],
['Sikkim','North East India','Mountain views, monasteries, lakes and scenic drives.','Gangtok, Pelling, Lachung, Tsomgo Lake'],
['Arunachal Pradesh','North East India','Remote mountain scenery, monasteries and distinctive local culture.','Tawang, Ziro, Bomdila, Itanagar'],
['Assam','North East India','Tea estates, river landscapes and wildlife experiences.','Kaziranga, Guwahati, Majuli, Jorhat'],
['Meghalaya','North East India','Waterfalls, caves, living root bridges and green highlands.','Shillong, Cherrapunji, Dawki, Mawlynnong'],
['Nagaland','North East India','Mountain villages, crafts and rich cultural traditions.','Kohima, Dimapur, Mon'],
['Tripura','North East India','Palaces, temples, lakes and local heritage.','Agartala, Neermahal, Unakoti'],
['Bihar','East India','Buddhist heritage, historic learning centres and pilgrimage routes.','Bodh Gaya, Rajgir, Nalanda, Patna'],
['Jharkhand','East India','Forests, waterfalls, temples and nature-led breaks.','Ranchi, Deoghar, Netarhat, Betla'],
['Delhi NCR','North India','Historic landmarks, museums, markets and food trails.','Delhi, Gurugram, Noida, Faridabad'],
['Andaman and Nicobar Islands','Islands','Island scenery, beaches and marine experiences subject to local rules.','Port Blair, Havelock/Swaraj Dweep, Neil/Shaheed Dweep'],
['Jammu','North India','Hill escapes, heritage and pilgrimage journeys.','Vaishno Devi, Patnitop, Jammu city']
];
const packageTitles = [
['Shimla and Kufri Escape','Himachal Pradesh','Hill Station Holidays'],['Manali Family Holiday','Himachal Pradesh','Family Holidays'],['Shimla–Manali Complete Tour','Himachal Pradesh','Family Holidays'],['Dharamshala and Dalhousie Tour','Himachal Pradesh','Nature Retreat'],['Spiti Valley Adventure','Himachal Pradesh','Adventure Tours'],['Kasol and Kullu Getaway','Himachal Pradesh','Weekend Getaways'],
['Mussoorie and Dehradun Holiday','Uttarakhand','Hill Station Holidays'],['Nainital Lake Holiday','Uttarakhand','Family Holidays'],['Rishikesh Adventure Retreat','Uttarakhand','Adventure Tours'],['Jim Corbett Wildlife Tour','Uttarakhand','Wildlife Safaris'],['Auli Snow and Mountain Holiday','Uttarakhand','Mountain Holidays'],['Char Dham Yatra','Uttarakhand','Pilgrimage Tours'],
['Srinagar and Gulmarg Holiday','Kashmir','Family Holidays'],['Kashmir Valley Complete Tour','Kashmir','Nature Retreat'],['Srinagar–Pahalgam–Sonamarg Tour','Kashmir','Nature Retreat'],
['Jaipur Heritage Weekend','Rajasthan','Heritage Tours'],['Udaipur Romantic Getaway','Rajasthan','Romantic Getaways'],['Jaisalmer Desert Experience','Rajasthan','Cultural Tours'],['Jodhpur and Jaisalmer Heritage Tour','Rajasthan','Heritage Tours'],['Rajasthan Royal Circuit','Rajasthan','Luxury Holidays'],
['Munnar and Alleppey Kerala Holiday','Kerala','Family Holidays'],['Kerala Backwaters and Hill Stations','Kerala','Nature Retreat'],['Wayanad Nature Retreat','Kerala','Nature Retreat'],['Kovalam and Varkala Beach Holiday','Kerala','Beach Holidays'],
['Ooty and Coonoor Escape','Tamil Nadu','Hill Station Holidays'],['Kodaikanal Hill Station Holiday','Tamil Nadu','Hill Station Holidays'],['Madurai and Rameswaram Temple Tour','Tamil Nadu','Pilgrimage Tours'],['Mysuru and Coorg Holiday','Karnataka','Nature Retreat'],['Hampi Heritage Tour','Karnataka','Heritage Tours'],['Gokarna Coastal Escape','Karnataka','Beach Holidays'],['Bengaluru and Mysuru City Tour','Karnataka','City Breaks'],['Tirupati Balaji Pilgrimage','Andhra Pradesh','Pilgrimage Tours'],
['Goa Beach Holiday','Goa','Beach Holidays'],['Mumbai and Lonavala Getaway','Maharashtra','Weekend Getaways'],['Shirdi Pilgrimage Tour','Maharashtra','Pilgrimage Tours'],['Mahabaleshwar Hill Station Holiday','Maharashtra','Hill Station Holidays'],['Dwarka and Somnath Tour','Gujarat','Pilgrimage Tours'],['Kutch and Gujarat Heritage Tour','Gujarat','Heritage Tours'],
['Varanasi Spiritual Experience','Uttar Pradesh','Pilgrimage Tours'],['Ayodhya and Varanasi Pilgrimage','Uttar Pradesh','Pilgrimage Tours'],['Mathura and Vrindavan Temple Tour','Uttar Pradesh','Pilgrimage Tours'],['Golden Temple Amritsar Tour','Punjab and Chandigarh','Sikh Pilgrimage'],['Vaishno Devi Pilgrimage','Jammu','Pilgrimage Tours'],['Kedarnath and Badrinath Tour','Uttarakhand','Pilgrimage Tours'],['Puri and Bhubaneswar Heritage Tour','Odisha','Heritage Tours'],
['Darjeeling and Gangtok Holiday','North East India','Hill Station Holidays'],['Meghalaya Waterfalls and Nature Tour','Meghalaya','Nature Retreat'],['Kaziranga Wildlife Experience','Assam','Wildlife Safaris'],['Tawang Adventure Tour','Arunachal Pradesh','Adventure Tours'],['Andaman Island Holiday','Andaman and Nicobar Islands','Beach Holidays'],['Lakshadweep Island Holiday','Islands','Beach Holidays'],
['Hyderabad Heritage and Food Tour','Telangana','Heritage Tours'],['Tirupati and Srisailam Pilgrimage','Andhra Pradesh','Pilgrimage Tours'],['Bodh Gaya Buddhist Circuit','Bihar','Pilgrimage Tours'],['Ujjain and Omkareshwar Jyotirlinga Tour','Madhya Pradesh','Pilgrimage Tours'],['Ranthambore Wildlife Safari','Rajasthan','Wildlife Safaris'],['Rann of Kutch Cultural Tour','Gujarat','Cultural Tours'],['Ladakh Scenic Road Trip','Ladakh','Road Trips'],['Chopta and Tungnath Trekking Holiday','Uttarakhand','Adventure Tours'],['Rameswaram and Kanyakumari Coastal Tour','Tamil Nadu','Pilgrimage Tours']
];
function seed(){
  if(db.prepare('SELECT count(*) n FROM destinations').get().n===0){
    const ins=db.prepare('INSERT INTO destinations(name,slug,region,summary,image,highlights,status) VALUES(?,?,?,?,?,?,?)');
    const tx=db.transaction(()=>destinationSeeds.forEach(d=>ins.run(d[0],slugify(d[0]),d[1],d[2],imageMap[d[0]]||imageMap.default,d[3],'published')));
    tx();
  }
  if(db.prepare('SELECT count(*) n FROM packages').get().n===0){
    const ins=db.prepare(`INSERT INTO packages(title,slug,destination,region,category,duration,season,image,summary,itinerary,inclusions,exclusions,price,status,featured) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const tx=db.transaction(()=>packageTitles.forEach((p,i)=>{
      const region = p[1]==='Himachal Pradesh'||p[1]==='Uttarakhand'||p[1]==='Kashmir'||p[1]==='Jammu'||p[1]==='Punjab and Chandigarh'?'North India':
        ['Rajasthan','Goa','Gujarat','Maharashtra'].includes(p[1])?'West India':
        ['Kerala','Tamil Nadu','Karnataka','Andhra Pradesh','Telangana'].includes(p[1])?'South India':
        ['North East India','Meghalaya','Assam','Arunachal Pradesh'].includes(p[1])?'North East India':
        ['Uttar Pradesh'].includes(p[1])?'North India':p[1]==='Ladakh'?'North India':p[1]==='Bihar'||p[1]==='Odisha'?'East India':'India';
      const image=imageMap[p[1]]||imageMap[p[2]==='Beach Holidays'?'Goa':'default']||imageMap.default;
      const summary=`A flexible ${p[2].toLowerCase()} travel template for ${p[1]}. Ask Journey Masterz for a tailored itinerary, current availability and a confirmed quote.`;
      ins.run(p[0],slugify(p[0]),p[1],region,p[2],'Request a tailored duration','Confirm dates and season',image,summary,
        'Day 1 — Arrival and check-in (to be confirmed)\\nDay 2 — Local sightseeing or planned experiences\\nDay 3 — Flexible exploration and return transfer\\nThis is a sample planning template. Final route, timings and services are confirmed after enquiry.',
        'To be confirmed in your written quote.','Personal expenses and any service not listed in the final written quote.', '', 'published', i<8?1:0);
    }));
    tx();
  }
  if(db.prepare('SELECT count(*) n FROM faqs').get().n===0){
    const f=db.prepare('INSERT INTO faqs(question,answer) VALUES(?,?)');
    [
      ['How do I book a trip?','Send an enquiry using the form or contact us by phone or WhatsApp. Our team can discuss a suitable itinerary and provide a quote.'],
      ['Are package prices fixed on the website?','Prices are shown only when configured. If no price is listed, request a quote; final pricing depends on travel dates, availability and selected services.'],
      ['Do you accept online payments on this website?','No. This website is enquiry-based and does not process online payments or display payment links. Confirm all arrangements directly with the business.'],
      ['Are pilgrimage registrations and permits guaranteed?','No. Access, registrations, opening dates and permits may change. Travellers should verify current official advisories before departure.']
    ].forEach(x=>f.run(...x));
  }
  if(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && db.prepare('SELECT count(*) n FROM users').get().n===0){
    const hash=bcrypt.hashSync(process.env.ADMIN_PASSWORD,12);
    db.prepare('INSERT OR IGNORE INTO users(email,password_hash) VALUES(?,?)').run(process.env.ADMIN_EMAIL.toLowerCase(),hash);
    console.log(`Admin account initialized for ${process.env.ADMIN_EMAIL}.`);
  }
}
seed();

app.disable('x-powered-by');
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{
  defaultSrc:["'self'"], styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],
  fontSrc:["'self'","https://fonts.gstatic.com"], imgSrc:["'self'","data:","https://images.unsplash.com","https://plus.unsplash.com"],
  scriptSrc:["'self'","'unsafe-inline'"], connectSrc:["'self'"], objectSrc:["'none'"], upgradeInsecureRequests:process.env.NODE_ENV==='production'?[]:null
}}}));
app.use(compression());
app.use(express.urlencoded({extended:false,limit:'30kb'}));
app.use(express.json({limit:'30kb'}));
app.use(express.static(path.join(__dirname,'public'),{maxAge:process.env.NODE_ENV==='production'?'1d':0}));
app.use('/uploads',express.static(uploadsDir,{maxAge:process.env.NODE_ENV==='production'?'1d':0}));
app.use(session({
  store:new FileStore({path:sessionsDir, ttl:8*60*60, retries:0}),
  secret:process.env.SESSION_SECRET||'development-only-change-me-before-deploy',
  resave:false,saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:8*60*60*1000}
}));
app.use((req,res,next)=>{
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.currentPath=req.path;res.locals.user=req.session.user||null;
  res.locals.contactPhone='+91 9899266481';res.locals.address='1348/27 Patel Nagar, Hisar, Haryana 125001';
  res.locals.whatsapp='919899266481';res.locals.baseUrl=baseUrl;
  res.locals.fmtPrice=(p)=>p?`₹${p}`:'Request a Quote';
  res.locals.escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  next();
});
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false,message:'Too many login attempts. Please wait and try again.'});
const enquiryLimiter=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false});
const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,uploadsDir),filename:(req,file,cb)=>cb(null,crypto.randomBytes(12).toString('hex')+path.extname(file.originalname).toLowerCase())});
const upload=multer({storage,limits:{fileSize:5*1024*1024},fileFilter:(req,file,cb)=>/^image\/(jpeg|png|webp)$/.test(file.mimetype)?cb(null,true):cb(new Error('Upload a JPG, PNG, or WebP image.'))});
function admin(req,res,next){if(!req.session.user)return res.redirect('/admin/login');next();}
function adminCsrf(req,res,next){if(!req.session.csrfToken || req.body._csrf!==req.session.csrfToken)return res.status(403).render('error',{title:'Session expired',message:'Please refresh the page and try again.'});next();}
function listPackages(filters={}){
  let sql="SELECT * FROM packages WHERE status='published'",args=[];
  if(filters.q){sql+=' AND (title LIKE ? OR destination LIKE ? OR summary LIKE ?)';args.push(`%${filters.q}%`,`%${filters.q}%`,`%${filters.q}%`);}
  if(filters.region){sql+=' AND region=?';args.push(filters.region);}
  if(filters.category){sql+=' AND category=?';args.push(filters.category);}
  if(filters.featured)sql+=' AND featured=1';
  sql+=' ORDER BY featured DESC, title ASC';
  return db.prepare(sql).all(...args);
}
function allDestinations(){return db.prepare("SELECT * FROM destinations WHERE status='published' ORDER BY name").all();}
function saveEnquiry(body){
  const name=safe(body.name,120),phone=safe(body.phone,40);
  if(!name||!phone) return {error:'Please enter your name and contact number.'};
  db.prepare('INSERT INTO enquiries(name,phone,email,travel_date,travellers,destination,message) VALUES(?,?,?,?,?,?,?)')
    .run(name,phone,safe(body.email,160),safe(body.travel_date,30),safe(body.travellers,50),safe(body.destination||body.package,180),safe(body.message,3000));
  return {ok:true};
}
function enquiryRoute(req,res){const out=saveEnquiry(req.body);if(out.error)return res.status(400).render('error',{title:'Check your details',message:out.error});res.render('thanks',{title:'Enquiry received'});}
app.get('/',(req,res)=>res.render('home',{title:'Discover India, Your Way',description:'Thoughtfully planned India holidays, family trips, mountain escapes and pilgrimage tours.',featured:listPackages({featured:true}).slice(0,6),destinations:allDestinations().slice(0,9),faqs:db.prepare("SELECT * FROM faqs WHERE status='published'").all()}));
app.get('/packages',(req,res)=>{
  const q=safe(req.query.q,100),region=safe(req.query.region,80),category=safe(req.query.category,80);
  const packages=listPackages({q,region,category});
  const page=Math.max(1,parseInt(req.query.page||'1',10)||1),limit=12;
  res.render('packages',{title:'India Holiday Packages',description:'Browse domestic holidays and request a customised travel quote.',packages:packages.slice((page-1)*limit,page*limit),total:packages.length,page,limit,q,region,category,regions:[...new Set(allDestinations().map(d=>d.region))].sort(),categories:[...new Set(db.prepare("SELECT category FROM packages WHERE status='published'").all().map(x=>x.category))].sort()});
});
app.get('/packages/:slug',(req,res)=>{
  const p=db.prepare("SELECT * FROM packages WHERE slug=? AND status='published'").get(req.params.slug);
  if(!p)return res.status(404).render('error',{title:'Package not found',message:'This package may have moved. Explore our current holiday collection.'});
  const similar=db.prepare("SELECT * FROM packages WHERE status='published' AND id<>? AND (region=? OR category=?) ORDER BY featured DESC LIMIT 3").all(p.id,p.region,p.category);
  res.render('package',{title:p.title,description:p.summary,package:p,similar});
});
app.get('/destinations',(req,res)=>res.render('destinations',{title:'Explore India by Region',description:'Discover Indian states, hill stations, islands, heritage cities and nature escapes.',destinations:allDestinations()}));
app.get('/destinations/:slug',(req,res)=>{
  const d=db.prepare("SELECT * FROM destinations WHERE slug=? AND status='published'").get(req.params.slug);
  if(!d)return res.status(404).render('error',{title:'Destination not found',message:'Explore all destinations and find your next trip.'});
  const packages=db.prepare("SELECT * FROM packages WHERE status='published' AND (destination LIKE ? OR region LIKE ?) ORDER BY featured DESC LIMIT 8").all(`%${d.name}%`,`%${d.region}%`);
  res.render('destination',{title:`Explore ${d.name}`,description:d.summary,destination:d,packages});
});
app.get('/pilgrimage-tours',(req,res)=>{
  const packages=db.prepare("SELECT * FROM packages WHERE status='published' AND (category LIKE '%Pilgrimage%' OR category LIKE '%Sikh%') ORDER BY title").all();
  const groups=[
    {name:'North India',slug:'north-india',items:'Vaishno Devi · Char Dham · Varanasi · Ayodhya · Golden Temple'},
    {name:'South India',slug:'south-india',items:'Tirupati · Madurai · Rameswaram · Sabarimala · Udupi'},
    {name:'Sikh heritage',slug:'sikh-pilgrimage',items:'Golden Temple · Anandpur Sahib · Hemkund Sahib'},
    {name:'Buddhist circuits',slug:'buddhist-circuits',items:'Bodh Gaya · Sarnath · Kushinagar · Rajgir'},
    {name:'Jain pilgrimage',slug:'jain-pilgrimage',items:'Shravanabelagola · Ranakpur · Palitana'}
  ];
  res.render('pilgrimage',{title:'Pilgrimage Tours Across India',description:'Respectful, flexible pilgrimage and heritage journeys across India.',packages,groups});
});
app.get('/pilgrimage-tours/:category',(req,res)=>{
  const groups={
    'north-india':{title:'North India Pilgrimage Tours',summary:'Plan a respectful journey through sacred cities, Himalayan shrines and Sikh heritage destinations.',items:'Vaishno Devi · Char Dham · Haridwar · Rishikesh · Varanasi · Ayodhya · Golden Temple'},
    'south-india':{title:'South India Temple Tours',summary:'Explore temple towns, coastal shrines and heritage circuits across southern India.',items:'Tirupati · Madurai · Rameswaram · Sabarimala · Udupi · Guruvayur'},
    'char-dham':{title:'Char Dham Yatra',summary:'A flexible planning template for the Char Dham pilgrimage in Uttarakhand.',items:'Yamunotri · Gangotri · Kedarnath · Badrinath'},
    'temple-tours':{title:'Temple Tours Across India',summary:'Create a temple circuit around your interests, pace and travel dates.',items:'Varanasi · Ayodhya · Mathura · Tirupati · Rameswaram · Dwarka · Somnath'},
    'buddhist-circuits':{title:'Buddhist Heritage Circuits',summary:'Discover important Buddhist heritage destinations and historic learning centres.',items:'Bodh Gaya · Sarnath · Kushinagar · Rajgir · Nalanda'},
    'sikh-pilgrimage':{title:'Sikh Pilgrimage & Heritage',summary:'Plan a respectful Sikh heritage journey with route and access details confirmed before travel.',items:'Golden Temple · Anandpur Sahib · Hemkund Sahib'},
    'jain-pilgrimage':{title:'Jain Pilgrimage Circuits',summary:'Explore Jain pilgrimage and heritage destinations with a flexible itinerary.',items:'Shravanabelagola · Ranakpur · Palitana'}
  };
  const group=groups[req.params.category];
  if(!group)return res.status(404).render('error',{title:'Pilgrimage category not found',message:'Explore our pilgrimage tours or ask us to plan a custom route.'});
  const packages=db.prepare("SELECT * FROM packages WHERE status='published' AND (category LIKE '%Pilgrimage%' OR category LIKE '%Sikh%') ORDER BY title").all();
  res.render('pilgrimage-category',{title:group.title,description:group.summary,group,packages});
});
app.get('/custom-trip',(req,res)=>res.render('custom-trip',{title:'Plan a Custom Trip',description:'Tell us how you would like to travel and request a personalised itinerary.'}));
app.post('/enquiries',enquiryLimiter,enquiryRoute);
app.post('/contact',enquiryLimiter,enquiryRoute);
app.get('/contact',(req,res)=>res.render('contact',{title:'Contact Journey Masterz',description:'Contact our travel team in Hisar, Haryana.'}));
app.get('/about',(req,res)=>res.render('about',{title:'About Journey Masterz',description:'Travel planning for India, made personal.'}));
app.get('/privacy',(req,res)=>res.render('legal',{title:'Privacy Policy',kind:'privacy'}));
app.get('/terms',(req,res)=>res.render('legal',{title:'Travel Terms',kind:'terms'}));

app.get('/admin/login',(req,res)=>res.render('admin-login',{title:'Admin Login',error:''}));
app.post('/admin/login',loginLimiter,adminCsrf,async(req,res)=>{
  const email=safe(req.body.email,160).toLowerCase(),password=String(req.body.password||'');
  const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if(!u||!bcrypt.compareSync(password,u.password_hash))return res.status(401).render('admin-login',{title:'Admin Login',error:'Email or password was not recognised.'});
  req.session.regenerate(err=>{if(err)return res.status(500).render('error',{title:'Login issue',message:'Please try again.'});req.session.user={id:u.id,email:u.email};res.redirect('/admin');});
});
app.post('/admin/logout',admin,adminCsrf,(req,res)=>req.session.destroy(()=>res.redirect('/admin/login')));
app.get('/admin',admin,(req,res)=>res.render('admin-dashboard',{title:'Admin Dashboard',stats:{packages:db.prepare('SELECT count(*) n FROM packages').get().n,destinations:db.prepare('SELECT count(*) n FROM destinations').get().n,enquiries:db.prepare("SELECT count(*) n FROM enquiries WHERE status='New'").get().n},packages:db.prepare('SELECT * FROM packages ORDER BY updated_at DESC LIMIT 8').all(),destinations:db.prepare('SELECT * FROM destinations ORDER BY name').all(),enquiries:db.prepare('SELECT * FROM enquiries ORDER BY id DESC LIMIT 10').all()}));
app.get('/admin/packages/new',admin,(req,res)=>res.render('admin-package-form',{title:'Add Package',item:null,destinations:allDestinations(),error:''}));
app.get('/admin/packages/:id/edit',admin,(req,res)=>{const item=db.prepare('SELECT * FROM packages WHERE id=?').get(req.params.id);if(!item)return res.redirect('/admin');res.render('admin-package-form',{title:'Edit Package',item,destinations:allDestinations(),error:''});});
app.post('/admin/packages/save',admin,upload.single('imageFile'),adminCsrf,(req,res)=>{
  const b=req.body,id=parseInt(b.id||'0',10)||0,title=safe(b.title,180),destination=safe(b.destination,180);
  if(!title||!destination)return res.status(400).render('admin-package-form',{title:'Package details',item:b,destinations:allDestinations(),error:'Title and destination are required.'});
  const slug=slugify(b.slug||title),image=req.file?`/uploads/${req.file.filename}`:safe(b.image,500);
  const vals=[title,slug,destination,safe(b.region,100),safe(b.category,100)||'Domestic Holidays',safe(b.duration,100),safe(b.season,100),image,safe(b.summary,1000),safe(b.itinerary,5000),safe(b.inclusions,2000),safe(b.exclusions,2000),safe(b.price,80),['published','draft','archived'].includes(b.status)?b.status:'draft',b.featured==='on'?1:0];
  try{
    if(id){db.prepare(`UPDATE packages SET title=?,slug=?,destination=?,region=?,category=?,duration=?,season=?,image=?,summary=?,itinerary=?,inclusions=?,exclusions=?,price=?,status=?,featured=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...vals,id);}
    else db.prepare(`INSERT INTO packages(title,slug,destination,region,category,duration,season,image,summary,itinerary,inclusions,exclusions,price,status,featured) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...vals);
    res.redirect('/admin');
  }catch(e){res.status(400).render('admin-package-form',{title:'Package details',item:b,destinations:allDestinations(),error:'Could not save. Check that the URL slug is unique.'});}
});
app.get('/admin/destinations/new',admin,(req,res)=>res.render('admin-destination-form',{title:'Add Destination',item:null,error:''}));
app.get('/admin/destinations/:id/edit',admin,(req,res)=>{const item=db.prepare('SELECT * FROM destinations WHERE id=?').get(req.params.id);if(!item)return res.redirect('/admin');res.render('admin-destination-form',{title:'Edit Destination',item,error:''});});
app.post('/admin/destinations/save',admin,upload.single('imageFile'),adminCsrf,(req,res)=>{
  const b=req.body,id=parseInt(b.id||'0',10)||0,name=safe(b.name,160);
  if(!name)return res.status(400).render('admin-destination-form',{title:'Destination details',item:b,error:'Destination name is required.'});
  const vals=[name,slugify(b.slug||name),safe(b.region,100),safe(b.summary,1000),req.file?`/uploads/${req.file.filename}`:safe(b.image,500),safe(b.highlights,1500),['published','draft','archived'].includes(b.status)?b.status:'draft'];
  try{
    if(id)db.prepare('UPDATE destinations SET name=?,slug=?,region=?,summary=?,image=?,highlights=?,status=? WHERE id=?').run(...vals,id);
    else db.prepare('INSERT INTO destinations(name,slug,region,summary,image,highlights,status) VALUES(?,?,?,?,?,?,?)').run(...vals);
    res.redirect('/admin');
  }catch(e){res.status(400).render('admin-destination-form',{title:'Destination details',item:b,error:'Could not save. Check that the URL slug is unique.'});}
});
app.post('/admin/enquiries/:id/status',admin,adminCsrf,(req,res)=>{db.prepare('UPDATE enquiries SET status=? WHERE id=?').run(['New','Contacted','Quoted','Closed'].includes(req.body.status)?req.body.status:'New',req.params.id);res.redirect('/admin');});
app.get('/admin/enquiries.csv',admin,(req,res)=>{
  const rows=db.prepare('SELECT id,name,phone,email,travel_date,travellers,destination,message,status,created_at FROM enquiries ORDER BY id DESC').all();
  const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  res.type('text/csv').attachment('journey-masterz-enquiries.csv').send([Object.keys(rows[0]||{id:'',name:'',phone:'',email:'',travel_date:'',travellers:'',destination:'',message:'',status:'',created_at:''}).join(','),...rows.map(r=>Object.values(r).map(quote).join(','))].join('\\n'));
});

// Versioned public API: only published content is exposed.
app.get('/api/v1/packages',(req,res)=>{
  const q=safe(req.query.q,100),region=safe(req.query.region,80),category=safe(req.query.category,80);
  let rows=listPackages({q,region,category});
  const total=rows.length,page=Math.max(1,parseInt(req.query.page||'1',10)||1),limit=Math.min(50,Math.max(1,parseInt(req.query.limit||'12',10)||12));
  rows=rows.slice((page-1)*limit,page*limit).map(({id,title,slug,destination,region,category,duration,season,image,summary,price})=>({id,title,slug,destination,region,category,duration,season,image,summary,price:price||null,url:`${baseUrl}/packages/${slug}`}));
  res.json({data:rows,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
});
app.get('/api/v1/packages/:slug',(req,res)=>{const p=db.prepare("SELECT id,title,slug,destination,region,category,duration,season,image,summary,itinerary,inclusions,exclusions,price FROM packages WHERE slug=? AND status='published'").get(req.params.slug);if(!p)return res.status(404).json({error:{code:'NOT_FOUND',message:'Package not found'}});res.json({data:{...p,price:p.price||null}});});
app.get('/api/v1/destinations',(req,res)=>res.json({data:allDestinations().map(({id,name,slug,region,summary,image,highlights})=>({id,name,slug,region,summary,image,highlights,url:`${baseUrl}/destinations/${slug}`}))}));
app.get('/api/v1/destinations/:slug',(req,res)=>{const d=db.prepare("SELECT id,name,slug,region,summary,image,highlights FROM destinations WHERE slug=? AND status='published'").get(req.params.slug);if(!d)return res.status(404).json({error:{code:'NOT_FOUND',message:'Destination not found'}});res.json({data:d});});
app.get('/api/v1/faqs',(req,res)=>res.json({data:db.prepare("SELECT question,answer FROM faqs WHERE status='published'").all()}));
app.post('/api/v1/enquiries',enquiryLimiter,(req,res)=>{const out=saveEnquiry(req.body||{});if(out.error)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:out.error}});res.status(201).json({data:{message:'Enquiry received. The travel team can follow up using the contact details you provided.'}});});
app.get('/openapi.json',(req,res)=>res.json({openapi:'3.0.3',info:{title:'Journey Masterz API',version:'1.0.0'},servers:[{url:`${baseUrl}/api/v1`}],paths:{'/packages':{get:{summary:'List and search published packages',parameters:[{name:'q',in:'query',schema:{type:'string'}},{name:'region',in:'query',schema:{type:'string'}},{name:'category',in:'query',schema:{type:'string'}},{name:'page',in:'query',schema:{type:'integer'}},{name:'limit',in:'query',schema:{type:'integer'}}],responses:{'200':{description:'Paginated published packages'}}}},'/packages/{slug}':{get:{summary:'Get published package',parameters:[{name:'slug',in:'path',required:true,schema:{type:'string'}}],responses:{'200':{description:'Package detail'},'404':{description:'Not found'}}}},'/destinations':{get:{summary:'List published destinations',responses:{'200':{description:'Destination list'}}}},'/destinations/{slug}':{get:{summary:'Get published destination',parameters:[{name:'slug',in:'path',required:true,schema:{type:'string'}}],responses:{'200':{description:'Destination detail'},'404':{description:'Not found'}}}},'/faqs':{get:{summary:'List public FAQs',responses:{'200':{description:'FAQ list'}}}},'/enquiries':{post:{summary:'Submit a travel enquiry',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['name','phone'],properties:{name:{type:'string'},phone:{type:'string'},email:{type:'string'},destination:{type:'string'},travel_date:{type:'string'},travellers:{type:'string'},message:{type:'string'}}}}}},responses:{'201':{description:'Enquiry received'},'400':{description:'Validation error'}}}}}}));
app.get('/api-docs',(req,res)=>res.render('api-docs',{title:'API Documentation'}));
app.get('/sitemap.xml',(req,res)=>{
  const urls=[`${baseUrl}/`,`${baseUrl}/packages`,`${baseUrl}/destinations`,`${baseUrl}/pilgrimage-tours`,`${baseUrl}/custom-trip`,`${baseUrl}/about`,`${baseUrl}/contact`,
    ...db.prepare("SELECT slug FROM packages WHERE status='published'").all().map(x=>`${baseUrl}/packages/${x.slug}`),
    ...db.prepare("SELECT slug FROM destinations WHERE status='published'").all().map(x=>`${baseUrl}/destinations/${x.slug}`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>${u}</loc></url>`).join('')}</urlset>`);
});
app.get('/robots.txt',(req,res)=>res.type('text/plain').send(`User-agent: *\\nAllow: /\\nDisallow: /admin\\nSitemap: ${baseUrl}/sitemap.xml`));
app.use((req,res)=>res.status(404).render('error',{title:'Page not found',message:'That page is not here. Explore destinations or browse our holiday packages.'}));
app.use((err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);res.status(500).render('error',{title:'Something went wrong',message:'Please try again, or contact the travel team by phone or WhatsApp.'});});
app.listen(PORT,()=>console.log(`Journey Masterz running at ${baseUrl}`));
}
start().catch(error => { console.error('Failed to start Journey Masterz:', error); process.exit(1); });
