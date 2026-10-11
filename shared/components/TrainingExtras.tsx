import { TrainingModule, TrainingSection, tr } from '../hooks/useTrainingCatalogue'
import { trainingCopy } from '../utils/trainingCopy'
/** Display the extra guidance in the canonical catalogue on both training home pages. */
export function TrainingSectionExtras({ section, language }: {section: TrainingSection; language: string}) {
  const w=trainingCopy(language)
  return <div className="space-y-3 text-sm">{section.errors?.length ? <div className="rounded-xl bg-red-50 p-3"><h5 className="font-semibold">{w.errors}</h5><ul className="list-disc pl-5">{section.errors.map((item,i)=><li key={i}>{tr(item,language)}</li>)}</ul></div>:null}{section.practice&&<div className="rounded-xl bg-blue-50 p-3"><h5 className="font-semibold">{w.practice}</h5><p>{tr(section.practice,language)}</p></div>}{section.checklist?.length ? <div className="rounded-xl border p-3"><h5 className="font-semibold">{w.checklist}</h5><ul className="list-disc pl-5">{section.checklist.map((item,i)=><li key={i}>{tr(item,language)}</li>)}</ul></div>:null}</div>
}
export function TrainingModuleExtras({ module, language }: {module: TrainingModule; language: string}) {
  const w=trainingCopy(language)
  return <div className="space-y-3 text-sm">{module.practical?.length ? <section className="rounded-xl border p-3"><h4 className="font-semibold">{w.practical}</h4><ul className="list-disc pl-5">{module.practical.map((item,i)=><li key={i}>{tr(item,language)}</li>)}</ul></section>:null}{module.sources?.length ? <section><h4 className="font-semibold">{w.sources}</h4><ul>{module.sources.map((item,i)=><li key={i}><a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{item.title}</a></li>)}</ul></section>:null}</div>
}
