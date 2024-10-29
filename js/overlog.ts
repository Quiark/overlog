let disabled = !process.env.TESTING
let baseURL = 'http://127.0.0.1:8111'

/*
// not working because axios is being mocked
export function enableForTest(axios: any) {
  http = axios.create({
    baseURL: `http://127.0.0.1:8111`,
  });

  disabled = false;
}
*/

export async function enableForTest() {
  disabled = false
}

export async function ovlg(d: any) {
  if (disabled) return
  let meta = {
    time: +new Date(),
    pid: process.pid,
    stack: [],
    data: d,
    mode: 'data',
    caller: {
      hash: Math.random().toString(36).substr(2, 5),
    },
    thread: {
      id: 0,
      name: 'nodejs',
    },
  }

  try {
    await fetch(baseURL + '/msg/?pid=0', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(meta),
    })
  } catch (e: any) {
    console.log('overlog problem ', e, ' , disabling')
    disabled = true
  }
}
