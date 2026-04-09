// lib/moodle.js — Moodle REST API client for Vertho Mentor IA

const MOODLE_URL = process.env.MOODLE_URL || 'https://academia.vertho.ai';
const MOODLE_TOKEN = process.env.MOODLE_TOKEN;

/**
 * Generic Moodle WS call via REST (POST).
 */
async function moodleCall(wsfunction, params = {}) {
  if (!MOODLE_TOKEN) {
    throw new Error('MOODLE_TOKEN environment variable is not set');
  }

  const url = `${MOODLE_URL}/webservice/rest/server.php`;

  const body = new URLSearchParams({
    wstoken: MOODLE_TOKEN,
    moodlewsrestformat: 'json',
    wsfunction,
    ...params,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Moodle API HTTP error: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  if (!text || text === 'null') return null; // some Moodle WS functions return null on success

  const data = JSON.parse(text);

  if (data?.exception) {
    throw new Error(`Moodle API error [${data.errorcode}]: ${data.message}`);
  }

  return data;
}

/**
 * Flatten nested objects into Moodle's bracket notation.
 * e.g. { users: [{ email: 'a' }] } => { 'users[0][email]': 'a' }
 */
function flattenParams(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const paramKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          Object.assign(result, flattenParams(item, `${paramKey}[${i}]`));
        } else {
          result[`${paramKey}[${i}]`] = String(item);
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenParams(value, paramKey));
    } else {
      result[paramKey] = String(value);
    }
  }
  return result;
}

/**
 * Create a user in Moodle.
 * @param {string} email
 * @param {string} nome - Full name (split into first/last at first space)
 * @returns {Promise<object>} Created user(s)
 */
export async function moodleCreateUser(email, nome) {
  const parts = nome.trim().split(/\s+/);
  const firstname = parts[0];
  const lastname = parts.length > 1 ? parts.slice(1).join(' ') : nome;
  const username = email.toLowerCase().replace(/@.*$/, '') + '_' + Date.now();

  const params = flattenParams({
    users: [
      {
        username,
        email: email.toLowerCase(),
        firstname,
        lastname,
        password: 'Vertho@' + Math.random().toString(36).slice(2, 10),
        auth: 'manual',
        createpassword: '1',
      },
    ],
  });

  return moodleCall('core_user_create_users', params);
}

/**
 * Get a Moodle user by email.
 * @param {string} email
 * @returns {Promise<object>} User data
 */
export async function moodleGetUser(email) {
  const params = flattenParams({
    criteria: [
      { key: 'email', value: email.toLowerCase() },
    ],
  });

  const data = await moodleCall('core_user_get_users', params);
  return data.users && data.users.length > 0 ? data.users[0] : null;
}

/**
 * Enroll a single user in a course.
 * @param {number} userId
 * @param {number} courseId
 * @param {number} [roleId=5] - 5 = student
 * @returns {Promise<object>}
 */
export async function moodleEnrollUser(userId, courseId, roleId = 5) {
  const params = flattenParams({
    enrolments: [
      { roleid: roleId, userid: userId, courseid: courseId },
    ],
  });

  return moodleCall('enrol_manual_enrol_users', params);
}

/**
 * Batch enroll multiple users/courses.
 * @param {Array<{userId: number, courseId: number, roleId?: number}>} enrollments
 * @returns {Promise<object>}
 */
export async function moodleEnrollBatch(enrollments) {
  const enrolments = enrollments.map((e) => ({
    roleid: e.roleId || 5,
    userid: e.userId,
    courseid: e.courseId,
  }));

  const params = flattenParams({ enrolments });
  return moodleCall('enrol_manual_enrol_users', params);
}

/**
 * Get course completion status for a user.
 * @param {number} userId
 * @param {number} courseId
 * @returns {Promise<object>}
 */
export async function moodleGetCompletion(userId, courseId) {
  return moodleCall('core_completion_get_course_completion_status', {
    userid: String(userId),
    courseid: String(courseId),
  });
}

/**
 * List all courses from Moodle (excludes site course id=1).
 */
export async function moodleGetCourses() {
  const data = await moodleCall('core_course_get_courses', {});
  return (data || []).filter(c => c.id !== 1);
}

/**
 * Get course contents (sections + modules).
 */
export async function moodleGetCourseContents(courseId) {
  return moodleCall('core_course_get_contents', { courseid: String(courseId) });
}

/**
 * Get all categories.
 */
export async function moodleGetCategories() {
  return moodleCall('core_course_get_categories', {});
}
