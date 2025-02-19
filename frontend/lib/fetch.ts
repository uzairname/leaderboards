

export function fetchLbApi(method: 'GET' | 'POST' | 'PUT' | 'DELETE', route: string, body?: any) {
    if (body) {
        body = JSON.stringify(body);
    }

    const baseUrl = `https://leaderboards-dev.5r.workers.dev`

    return fetch(`${baseUrl}${route}`, {
        method,
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `${process.env.APP_KEY}`,
        },
        body,
    }).then(res => {
        if (res.status === 200) {
            return res
        } else {
            throw new Error(`Error: ${res.status} ${res.statusText}`)
        }
    }).catch(err => {
        console.error(err)
        throw err
    })
}