import { APIInteractionResponseCallbackData, ButtonStyle, ComponentType } from 'discord-api-types/v9'
import { field, StringData } from '.'

const schema = {
  button: field.Enum({
    increment: null,
    decrement: null,
  }),
  counter: field.Int(),
  fruits: field.Array(
    field.Object({
      type: field.String(),
      expiration: field.Date(),
      selected: field.Boolean(),
    }),
  ),
}

function onCommand(): any {
  const data = new StringData(schema).saveAll({
    fruits: [
      {
        type: 'Apple',
      },
      {
        type: 'Wateremlon',
        selected: true,
      },
    ],
  })

  const messageData: APIInteractionResponseCallbackData = {
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            label: 'Increment',
            custom_id: data.set.button('increment').encode(),
            style: ButtonStyle.Primary,
          },
          {
            type: ComponentType.Button,
            label: 'Decrement',
            custom_id: data.set.button('decrement').encode(),
            style: ButtonStyle.Primary,
          },
        ],
      },
    ],
  }
  return messageData
}

function onComponent(customId: string) {
  const state = new StringData(schema, customId)

  const counter = state.data.counter ?? 0

  if (state.is.button('increment')) {
    state.save.counter(counter + 1)
  } else if (state.is.button('decrement')) {
    state.save.counter(counter - 1)
  }

  state.set.fruits([
    {
      type: 'Banana',
      expiration: new Date(),
      selected: false,
    },
  ])

  console.log(state.data)
  /**
  {
    button: 'increment',
    fruits: [ { type: 'Apple' }, { type: 'Wateremlon', selected: true } ],
    counter: 1
  }
  */
}

// Send an interaction response
const response1 = onCommand()
const sentCustomId = response1.components[0].components[0].custom_id

// Receive an interaction
const receivedCustomId = sentCustomId
onComponent(receivedCustomId)
