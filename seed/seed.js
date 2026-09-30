/**
 * Seed script: populates the database with demo data.
 * Run with: node seed/seed.js
 *
 * Creates:
 *  - 1 editor + 5 reporters
 *  - 500+ articles in various states
 *  - Comments on published articles
 *  - View stats over the past 30 days
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/the-daily-web');

const User = require('../models/User');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ViewStat = require('../models/ViewStat');

const CATEGORIES = Article.CATEGORIES;

const LOREM = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.

At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.`;

const ARTICLE_TEMPLATES = [
  { prefix: 'Breaking', topics: ['Market Crash Fears', 'New Policy Announcement', 'Scientific Discovery', 'Sports Record Broken', 'Tech Giant Acquires Startup'] },
  { prefix: 'Analysis', topics: ['Economic Outlook', 'Climate Change Impact', 'AI Revolution', 'Healthcare Reform', 'Space Exploration'] },
  { prefix: 'Report', topics: ['Global Summit', 'Local Election Results', 'Corporate Earnings', 'Research Findings', 'Infrastructure Update'] },
  { prefix: 'Opinion', topics: ['Future of Work', 'Social Media Effect', 'Education System', 'Privacy Rights', 'Urban Planning'] },
  { prefix: 'Feature', topics: ['Startup Ecosystem', 'Cultural Shift', 'Environmental Crisis', 'Digital Transformation', 'Human Interest'] },
];

const COMMENT_AUTHORS = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Isabel', 'Jack', 'Karen', 'Leo', 'Mia', 'Nick', 'Olivia', 'Paul', 'Quinn', 'Rachel', 'Sam', 'Tina'];
const COMMENT_BODIES = [
  'Very insightful article! Thank you for sharing.',
  'I completely agree with the points raised here.',
  'This is concerning. We need more coverage on this topic.',
  'Excellent reporting. Looking forward to more like this.',
  'I have a different perspective. The data shows otherwise.',
  'Can you provide sources for these claims?',
  'This is exactly what I was looking for. Well written!',
  'Interesting take. I learned something new today.',
  'The headline is a bit misleading but the content is solid.',
  'Thank you for the balanced coverage.',
];

const IMAGES = [
  'https://picsum.photos/seed/art1/800/450',
  'https://picsum.photos/seed/art2/800/450',
  'https://picsum.photos/seed/art3/800/450',
  'https://picsum.photos/seed/art4/800/450',
  'https://picsum.photos/seed/art5/800/450',
  'https://picsum.photos/seed/art6/800/450',
  'https://picsum.photos/seed/art7/800/450',
  'https://picsum.photos/seed/art8/800/450',
  'https://picsum.photos/seed/art10/800/450',
  'https://picsum.photos/seed/art11/800/450',
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function daysAgo(n) { return new Date(Date.now() - n * 24 * 3600 * 1000); }
function hoursAgo(n) { return new Date(Date.now() - n * 3600 * 1000); }

function genTitle(i) {
  const tmpl = ARTICLE_TEMPLATES[i % ARTICLE_TEMPLATES.length];
  const topic = tmpl.topics[i % tmpl.topics.length];
  return `${tmpl.prefix}: ${topic} — Issue ${i + 1}`;
}

function genContent(title) {
  return `${title}\n\n${LOREM}\n\n${LOREM}\n\nIn conclusion, this topic continues to evolve rapidly. Our reporters will continue to provide updates as the situation develops. Stay tuned to The Daily Web for the latest news.\n\n${LOREM}`;
}

function genSummary(title) {
  return `A comprehensive report on "${title}". Experts weigh in on the latest developments and what they mean for the public.`;
}

async function seed() {
  console.log('Clearing existing data...');
  await User.deleteMany({});
  await Article.deleteMany({});
  await Comment.deleteMany({});
  await ViewStat.deleteMany({});

  // Create users
  console.log('Creating users...');
  const hash = (p) => bcrypt.hash(p, 12);

  const editor = await User.create({
    username: 'editor1',
    passwordHash: await hash('editor123'),
    name: 'Emma Editor',
    role: 'editor',
  });

  await User.create({
    username: 'editor2',
    passwordHash: await hash('editor123'),
    name: 'Ethan Editor',
    role: 'editor',
  });

  const reporterUsers = [];
  const reporterNames = ['Alice Reporter', 'Bob Writer', 'Carol Journalist', 'David Press', 'Elena News'];
  for (let i = 0; i < 5; i++) {
    const u = await User.create({
      username: `reporter${i + 1}`,
      passwordHash: await hash('reporter123'),
      name: reporterNames[i],
      role: 'reporter',
    });
    reporterUsers.push(u);
  }

  console.log('Users created. Creating articles...');

  const articles = [];
  const TOTAL = 500;

  for (let i = 0; i < TOTAL; i++) {
    const cat = CATEGORIES[i % CATEGORIES.length];
    const author = reporterUsers[i % reporterUsers.length];
    const title = genTitle(i);

    // Determine status distribution
    let status, publishedAt, editorNote, pendingUpdate, autoSave;
    const roll = i % 10;

    if (roll < 6) {
      // 60% published
      status = 'published';
      publishedAt = daysAgo(randInt(1, 29));
    } else if (roll < 8) {
      // 20% pending
      status = 'pending';
      publishedAt = null;
    } else if (roll === 8) {
      // 10% draft
      status = 'draft';
      publishedAt = null;
      autoSave = {
        title: title + ' (auto-saved)',
        content: genContent(title),
        summary: genSummary(title),
        image: '',
        savedAt: new Date(),
      };
    } else {
      // 10% returned
      status = 'returned';
      editorNote = rand(['Please add more sources.', 'The title is misleading, please revise.', 'Content needs more depth.', 'Grammar errors found, please proofread.']);
    }

    const articleData = {
      title, content: genContent(title), summary: genSummary(title),
      image: rand(IMAGES), category: cat, author: author._id,
      status, publishedAt, editorNote: editorNote || '',
      views: 0,
    };
    if (autoSave) articleData.autoSave = autoSave;

    // Add pending updates to some published articles (articles 0,10,20,...)
    if (status === 'published' && i % 10 === 0) {
      articleData.pendingUpdate = {
        title: title + ' [Updated]',
        content: genContent(title + ' — Updated version with new information.'),
        summary: 'Updated: ' + genSummary(title),
        image: rand(IMAGES),
        status: 'pending',
        editorNote: '',
        submittedAt: hoursAgo(randInt(1, 12)),
      };
    }

    articles.push(articleData);
  }

  const inserted = await Article.insertMany(articles);
  console.log(`Created ${inserted.length} articles.`);

  // Generate view statistics using the same logic as real views:
  // each simulated view increments ViewStat.count AND Article.views together.
  console.log('Generating view statistics...');
  const publishedArticles = inserted.filter(a => a.status === 'published');

  // viewTotals tracks the total view count per article so we can update Article.views at the end
  const viewTotals = new Map(); // articleId string → total count

  const viewStatDocs = [];

  for (const article of publishedArticles.slice(0, 100)) {
    const daysBack = 30;
    for (let d = daysBack; d >= 0; d--) {
      for (let h = 0; h < 24; h += 3) {
        const hour = new Date(Date.now() - d * 24 * 3600 * 1000);
        hour.setHours(h, 0, 0, 0);
        if (hour > article.publishedAt) {
          const timeBoost = (h >= 8 && h <= 20) ? 3 : 1;
          const freshBoost = d < 3 ? 5 : (d < 7 ? 3 : 1);
          const count = randInt(0, 50) * timeBoost * freshBoost;
          if (count > 0) {
            viewStatDocs.push({ article: article._id, hour, count, publishEvents: [] });
            const key = article._id.toString();
            viewTotals.set(key, (viewTotals.get(key) || 0) + count);
          }
        }
      }
    }
    // Record publish event in the correct hour bucket
    const pubHour = new Date(article.publishedAt);
    pubHour.setMinutes(0, 0, 0);
    const existingDoc = viewStatDocs.find(
      d => d.article.toString() === article._id.toString() &&
           d.hour.getTime() === pubHour.getTime()
    );
    if (existingDoc) {
      existingDoc.publishEvents.push(article.publishedAt);
    } else {
      const count = randInt(5, 30);
      viewStatDocs.push({ article: article._id, hour: pubHour, count, publishEvents: [article.publishedAt] });
      const key = article._id.toString();
      viewTotals.set(key, (viewTotals.get(key) || 0) + count);
    }
  }

  // Insert view stats in batches
  for (let i = 0; i < viewStatDocs.length; i += 500) {
    await ViewStat.insertMany(viewStatDocs.slice(i, i + 500));
  }
  console.log(`Created ${viewStatDocs.length} view stat records.`);

  // Update each article's views counter to exactly match the ViewStat total
  // This makes article.views and the analytics chart always consistent
  console.log('Syncing article view counts with ViewStat totals...');
  const viewUpdateOps = [];
  for (const [articleId, total] of viewTotals) {
    viewUpdateOps.push({
      updateOne: { filter: { _id: articleId }, update: { $set: { views: total } } },
    });
  }
  if (viewUpdateOps.length) await Article.bulkWrite(viewUpdateOps);
  console.log(`Updated view counts for ${viewUpdateOps.length} articles.`);

  // Create comments on published articles
  console.log('Creating comments...');
  const commentDocs = [];
  for (const article of publishedArticles.slice(0, 200)) {
    const commentCount = randInt(0, 8);
    for (let c = 0; c < commentCount; c++) {
      commentDocs.push({
        article: article._id,
        author: rand(COMMENT_AUTHORS),
        body: rand(COMMENT_BODIES),
        createdAt: new Date(article.publishedAt.getTime() + randInt(1, 72) * 3600 * 1000),
        updatedAt: new Date(),
      });
    }
  }
  await Comment.insertMany(commentDocs);
  console.log(`Created ${commentDocs.length} comments.`);

  console.log('\n✅ Seed complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Login credentials:');
  console.log('  Editor1:   username=editor1     password=editor123');
  console.log('  Editor2:   username=editor2     password=editor123');
  console.log('  Reporter1: username=reporter1   password=reporter123');
  console.log('  Reporter2: username=reporter2   password=reporter123');
  console.log('  Reporter3: username=reporter3   password=reporter123');
  console.log('  Reporter4: username=reporter4   password=reporter123');
  console.log('  Reporter5: username=reporter5   password=reporter123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  mongoose.connection.close();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
