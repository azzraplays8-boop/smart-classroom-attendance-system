import http from 'http';

const baseURL = 'http://127.0.0.1:5000/students';

const request = (method, url, body = null) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const parsed = new URL(url);
  const options = {
    method,
    hostname: parsed.hostname,
    port: Number(parsed.port),
    path: parsed.pathname + parsed.search,
    headers: {
      'Content-Type': 'application/json',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
    },
  };

  const req = http.request(options, (res) => {
    let chunks = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => chunks += chunk);
    res.on('end', () => {
      let body;
      try {
        body = JSON.parse(chunks);
      } catch {
        body = chunks;
      }
      resolve({ status: res.statusCode, body });
    });
  });

  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});

const sample = {
  studentNumber: 'S12345',
  lastName: 'Doe',
  firstName: 'John',
  middleName: 'A',
  gender: 'Male',
  dateOfBirth: '2000-01-01',
  email: 'john.doe@example.com',
  contactNumber: '09171234567',
  course: 'BSIT',
  year: '1',
  section: 'A',
  status: 'Active',
};

const run = async () => {
  console.log('GET initial');
  let res = await request('GET', baseURL);
  console.log(res.status, Array.isArray(res.body?.students) ? res.body.students.length : res.body);

  console.log('POST sample');
  res = await request('POST', baseURL, sample);
  console.log(res.status, res.body);
  if (res.status !== 201) throw new Error('POST failed');
  const id = res.body.id;

  res = await request('GET', baseURL);
  console.log('after post count', res.body.students.length);

  console.log('PUT update');
  const update = { ...sample, firstName: 'Johnny', email: 'johnny.doe@example.com' };
  res = await request('PUT', `${baseURL}/${id}`, update);
  console.log(res.status, res.body);
  if (res.status !== 200) throw new Error('PUT failed');
  res = await request('GET', baseURL);
  const updated = res.body.students.find((s) => Number(s.id) === Number(id));
  console.log('updated', updated?.firstName, updated?.email);

  console.log('DELETE single');
  res = await request('DELETE', `${baseURL}/${id}`);
  console.log(res.status, res.body);
  if (res.status !== 200) throw new Error('DELETE single failed');
  res = await request('GET', baseURL);
  console.log('after delete count', res.body.students.length);

  console.log('POST duplicate test');
  res = await request('POST', baseURL, sample);
  console.log('create status', res.status, res.body);
  if (res.status !== 201) throw new Error('first duplicate test create failed');
  const id2 = res.body.id;
  res = await request('POST', baseURL, sample);
  console.log('duplicate status', res.status, res.body);
  if (res.status === 201) throw new Error('duplicate allowed');

  console.log('DELETE all');
  res = await request('DELETE', baseURL);
  console.log(res.status, res.body);
  if (res.status !== 200) throw new Error('DELETE all failed');
  res = await request('GET', baseURL);
  console.log('after delete all count', res.body.students.length);

  console.log('All backend API smoke tests passed');
};

run().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
