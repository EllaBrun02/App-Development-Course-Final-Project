// Add three fictional demonstration articles without clearing existing data.
// Stable draft keys make repeat runs skip completed examples and allow an
// interrupted run to finish its unpublished example without duplicating stats.
const mongoose = require('mongoose');
const User = require('../models/User');
const Article = require('../models/Article');
const ViewStat = require('../models/ViewStat');

const HOUR = 3600 * 1000;
const EXAMPLES = [
  { key: 'demo-approved-updates-v1-technology', category: 'Technology', subject: 'Community technology workshop' },
  { key: 'demo-approved-updates-v1-science', category: 'Science', subject: 'School science exhibition' },
  { key: 'demo-approved-updates-v1-sports', category: 'Sports', subject: 'Local sports tournament' },
];

async function addDemoUpdates() {
  const reporter = await User.findOne({ role: 'reporter' }).sort({ _id: 1 });
  if (!reporter) throw new Error('Create a reporter account before adding demo articles.');
  await Article.init();
  await ViewStat.init();
  const results = [];

  for (const example of EXAMPLES) {
    const fields = {
      title: `Demo: ${example.subject}`,
      summary: 'Fictional demonstration: initial publication followed by two approved updates.',
      content: `${example.subject}\n\nThis fictional story demonstrates the publication workflow.\n\n` +
        'Initial publication: the event was announced.\n\n' +
        'First approved update: the programme and participant details were added.\n\n' +
        'Second approved update: the results and a follow-up summary were added.\n\n' +
        'The analytics page contains simulated hourly views before and after each update.',
      image: '',
      category: example.category,
    };
    const start = new Date(Date.now() - 72 * HOUR);
    start.setMinutes(0, 0, 0);
    const article = await Article.findOneAndUpdate(
      { author: reporter._id, draftKey: example.key },
      { $setOnInsert: { ...fields, status: 'draft', createdAt: new Date(start.getTime() + 15 * 60000) } },
      { upsert: true, new: true, setDefaultsOnInsert: true, timestamps: false },
    );
    if (article.status !== 'draft') {
      results.push({ id: article.id, title: article.title, added: false });
      continue;
    }
    if (Object.entries(fields).some(([key, value]) => article[key] !== value)) {
      throw new Error(`Demo draft ${article.id} was edited; leaving it unchanged.`);
    }

    // Use the saved origin when resuming a partially completed example.
    const origin = new Date(article.createdAt);
    origin.setMinutes(0, 0, 0);
    const events = [0, 24, 48].map(h => new Date(origin.getTime() + h * HOUR + 15 * 60000));
    const buckets = Array.from({ length: 72 }, (_,h) => ({
      article: article._id,
      hour: new Date(origin.getTime() + h * HOUR),
      count: (h < 24 ? 12 : h < 48 ? 30 : 60) + (h % 6) * 2,
      publishEvents: h === 0 ? [events[0]] : h === 24 ? [events[1]] : h === 48 ? [events[2]] : [],
    }));
    await ViewStat.bulkWrite(buckets.map(bucket => ({ updateOne: {
      filter: { article: article._id, hour: bucket.hour },
      update: { $setOnInsert: bucket },
      upsert: true,
    } })));
    const stats = await ViewStat.find({ article: article._id });
    article.views = stats.reduce((total, stat) => total + stat.count, 0);
    article.status = 'published';
    article.publishedAt = events[2];
    await article.save();
    results.push({ id: article.id, title: article.title, added: true });
  }
  return results;
}

if (require.main === module) {
  (async () => {
    try {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/the-daily-web');
      const results = await addDemoUpdates();
      for (const result of results) console.log(`${result.added ? 'Added' : 'Already present'}: ${result.title} (${result.id})`);
      console.log('Existing articles, comments and users were preserved.');
    } catch (err) {
      console.error(`Demo preparation failed: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
}

module.exports = { addDemoUpdates };
