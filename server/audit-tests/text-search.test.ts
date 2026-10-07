import {expect,test} from '@jest/globals'
import {containsText} from '../src/utils/textSearch'
test.each(['postgresql://synthetic/db','postgres://synthetic/db'])('PostgreSQL connector %s retains explicit insensitive mode',url=>{
 expect(containsText('MiXeDÆ',url)).toEqual({contains:'MiXeDÆ',mode:'insensitive'})
})
test('SQLite connector omits the unsupported argument without altering the search text',()=>{
 const filter=containsText('MiXeDÆ','file:/tmp/synthetic.db')
 expect(filter).toEqual({contains:'MiXeDÆ'});expect(filter).not.toHaveProperty('mode')
})
