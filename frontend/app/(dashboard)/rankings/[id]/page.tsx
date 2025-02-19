

export default async function Page({
    params,
  }: {
    params: Promise<{ id: string }>
  }) {
    const id = (await params).id;

    return (
      <div className="flex flex-col items-center justify-start min-h-screen p-24">
        <h1 className="text-4xl font-bold">Ranking: {id}</h1>
        <p className="mt-4 text-lg">This is the ranking page for {id}</p>
      </div>
    )
}
